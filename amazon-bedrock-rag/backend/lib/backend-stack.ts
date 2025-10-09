import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  RemovalPolicy,
  CustomResource,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as uuid from "uuid";
import { bedrock } from "@cdklabs/generative-ai-cdk-constructs";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as cr from "aws-cdk-lib/custom-resources";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as awsbedrock from "aws-cdk-lib/aws-bedrock";
import { join } from "path";

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /** Bedrock Guardrails for Content Safety */
    const guardrail = new awsbedrock.CfnGuardrail(this, "ChatbotGuardrail", {
      name: "chatbot-content-filter",
      description: "Content filtering for harmful or inappropriate inputs/outputs",
      blockedInputMessaging:
        "This request has been flagged for harmful language/content. Please rephrase your request and try again.",
      blockedOutputsMessaging:
        "This request has been flagged for harmful language/content. Please rephrase your request and try again.",
      contentPolicyConfig: {
        filtersConfig: [
          {
            type: "SEXUAL",
            inputStrength: "HIGH",
            outputStrength: "HIGH",
          },
          {
            type: "VIOLENCE",
            inputStrength: "HIGH",
            outputStrength: "HIGH",
          },
          {
            type: "HATE",
            inputStrength: "HIGH",
            outputStrength: "HIGH",
          },
          {
            type: "INSULTS",
            inputStrength: "MEDIUM",
            outputStrength: "MEDIUM",
          },
        ],
      },
    });

    /** Knowledge Base */

    const knowledgeBase = new bedrock.VectorKnowledgeBase(
      this,
      "knowledgeBase",
      {
        embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1,
      }
    );

    // Grant Knowledge Base role permission to invoke Bedrock embedding model
    knowledgeBase.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/amazon.titan-embed-text-v1`,
        ],
      })
    );

    /** S3 bucket for Bedrock data source */
    const docsBucket = new s3.Bucket(this, "docsbucket-" + uuid.v4(), {
      lifecycleRules: [
        {
          expiration: Duration.days(10),
        },
      ],
      blockPublicAccess: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
        },
      ],
    });

    const s3DataSource = new bedrock.S3DataSource(this, "s3DataSource", {
      bucket: docsBucket,
      knowledgeBase: knowledgeBase,
      dataSourceName: "docs",
      chunkingStrategy: bedrock.ChunkingStrategy.fixedSize({
        maxTokens: 500,
        overlapPercentage: 20,
      }),
    });

    const s3PutEventSource = new S3EventSource(docsBucket, {
      events: [s3.EventType.OBJECT_CREATED_PUT],
    });

    /** Web Crawler for bedrock data Source */

    const createWebDataSourceLambda = new NodejsFunction(
      this,
      "CreateWebDataSourceHandler",
      {
        runtime: Runtime.NODEJS_18_X,
        entry: join(__dirname, "../lambda/dataSource/index.js"),
        functionName: `create-web-data-source`,
        timeout: Duration.minutes(1),
        environment: {
          KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        },
      }
    );

    const webDataSourceProvider = new cr.Provider(
      this,
      "WebDataSourceProvider",
      {
        onEventHandler: createWebDataSourceLambda,
        logRetention: logs.RetentionDays.ONE_DAY,
      }
    );

    const createWebDataSourceResource = new CustomResource(
      this,
      "WebDataSourceResource",
      {
        serviceToken: webDataSourceProvider.serviceToken,
        resourceType: "Custom::BedrockWebDataSource",
      }
    );

    /** SNS Topic for Alerts */
    const alertTopic = new sns.Topic(this, "AlertTopic", {
      displayName: "Chatbot Processing Alerts",
      topicName: "chatbot-alerts",
    });

    /** Dead Letter Queue for Failed Ingestions */
    const ingestionDLQ = new sqs.Queue(this, "IngestionDLQ", {
      queueName: "ingestion-failures-dlq",
      retentionPeriod: Duration.days(14), // Keep failed messages for 2 weeks
      visibilityTimeout: Duration.minutes(5),
    });

    /** S3 Ingest Lambda for S3 data source */

    const lambdaIngestionJob = new NodejsFunction(this, "IngestionJob", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/ingest/index.js"),
      functionName: `start-ingestion-trigger`,
      timeout: Duration.minutes(15),
      deadLetterQueue: ingestionDLQ,
      retryAttempts: 2,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        DATA_SOURCE_ID: s3DataSource.dataSourceId,
        BUCKET_ARN: docsBucket.bucketArn,
      },
    });

    // Grant Lambda read access to bucket
    docsBucket.grantRead(lambdaIngestionJob);

    lambdaIngestionJob.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:StartIngestionJob"],
        resources: [knowledgeBase.knowledgeBaseArn],
      })
    );

    // Add bucket policy to allow notification configuration
    docsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowBucketNotificationConfiguration",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ArnPrincipal(`arn:aws:iam::${Stack.of(this).account}:root`)],
        actions: [
          "s3:PutBucketNotification",
          "s3:GetBucketNotification",
        ],
        resources: [docsBucket.bucketArn],
      })
    );

    lambdaIngestionJob.addEventSource(s3PutEventSource);

    /** Web crawler ingest Lambda */

    const lambdaCrawlJob = new NodejsFunction(this, "CrawlJob", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/crawl/index.js"),
      functionName: `start-web-crawl-trigger`,
      timeout: Duration.minutes(15),
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        DATA_SOURCE_ID:
          createWebDataSourceResource.getAttString("DataSourceId"),
      },
    });

    lambdaCrawlJob.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:StartIngestionJob"],
        resources: [knowledgeBase.knowledgeBaseArn],
      })
    );

    const rule = new events.Rule(this, "ScheduleWebCrawlRule", {
      schedule: events.Schedule.rate(Duration.days(1)), // Adjust the cron expression as needed
    });

    rule.addTarget(new targets.LambdaFunction(lambdaCrawlJob));

    /** Lambda to update the list of seed urls in Web crawler data source*/

    const lambdaUpdateWebUrls = new NodejsFunction(this, "UpdateWebUrls", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/webUrlSources/index.js"),
      functionName: `update-web-crawl-urls`,
      timeout: Duration.minutes(15),
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        DATA_SOURCE_ID:
          createWebDataSourceResource.getAttString("DataSourceId"),
        DATA_SOURCE_NAME: "WebCrawlerDataSource",
      },
    });

    lambdaUpdateWebUrls.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:GetDataSource", "bedrock:UpdateDataSource"],
        resources: [knowledgeBase.knowledgeBaseArn],
      })
    );

    /** Lambda to get the list of seed urls in Web crawler data source*/

    const lambdaGetWebUrls = new NodejsFunction(this, "GetWebUrls", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/getUrls/index.js"),
      functionName: `get-web-crawl-urls`,
      timeout: Duration.minutes(15),
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        DATA_SOURCE_ID:
          createWebDataSourceResource.getAttString("DataSourceId"),
      },
    });

    lambdaGetWebUrls.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:GetDataSource"],
        resources: [knowledgeBase.knowledgeBaseArn],
      })
    );

    createWebDataSourceLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:CreateDataSource",
          "bedrock:UpdateDataSource",
          "bedrock:DeleteDataSource",
        ],
        resources: [knowledgeBase.knowledgeBaseArn],
      })
    );

    const apiGateway = new apigw.RestApi(this, "rag", {
      description: "API for RAG",
      restApiName: "rag-api",
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
      },
    });

    /** Lambda for handling retrieval and answer generation  */

    const lambdaQuery = new NodejsFunction(this, "Query", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/query/index.js"),
      functionName: `query-bedrock-llm`,
      //query lambda duration set to match API Gateway max timeout
      timeout: Duration.seconds(29),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        GUARDRAIL_ID: guardrail.attrGuardrailId,
        GUARDRAIL_VERSION: "DRAFT",
      },
    });

    // Restrict Bedrock permissions to specific Knowledge Base (least privilege)
    lambdaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:RetrieveAndGenerate", "bedrock:Retrieve"],
        resources: [knowledgeBase.knowledgeBaseArn],
      })
    );

    // Restrict InvokeModel to specific foundation models
    lambdaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0`,
          `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/anthropic.claude-instant-v1`,
          `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
          `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
        ],
      })
    );

    // ApplyGuardrail permission for content filtering
    lambdaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:ApplyGuardrail"],
        resources: [guardrail.attrGuardrailArn],
      })
    );

    apiGateway.root
      .addResource("docs")
      .addMethod("POST", new apigw.LambdaIntegration(lambdaQuery));

    apiGateway.root
      .addResource("web-urls")
      .addMethod("POST", new apigw.LambdaIntegration(lambdaUpdateWebUrls));

    apiGateway.root
      .addResource("urls")
      .addMethod("GET", new apigw.LambdaIntegration(lambdaGetWebUrls));

    apiGateway.addUsagePlan("usage-plan", {
      name: "dev-docs-plan",
      description: "usage plan for dev",
      apiStages: [
        {
          api: apiGateway,
          stage: apiGateway.deploymentStage,
        },
      ],
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
    });

    /** CloudWatch Alarms */
    
    // Alarm for Query Lambda errors
    const queryErrorAlarm = new cloudwatch.Alarm(this, "QueryLambdaErrors", {
      metric: lambdaQuery.metricErrors({
        period: Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: "Alert when Query Lambda has >5 errors in 5 minutes",
      alarmName: "chatbot-query-errors",
    });
    queryErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));

    // Alarm for Ingestion Lambda errors
    const ingestionErrorAlarm = new cloudwatch.Alarm(
      this,
      "IngestionLambdaErrors",
      {
        metric: lambdaIngestionJob.metricErrors({
          period: Duration.minutes(5),
        }),
        threshold: 3,
        evaluationPeriods: 1,
        alarmDescription:
          "Alert when Ingestion Lambda has >3 errors in 5 minutes",
        alarmName: "chatbot-ingestion-errors",
      }
    );
    ingestionErrorAlarm.addAlarmAction(
      new cloudwatch_actions.SnsAction(alertTopic)
    );

    // Alarm for messages in DLQ
    const dlqAlarm = new cloudwatch.Alarm(this, "DLQMessagesAlarm", {
      metric: ingestionDLQ.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Alert when messages appear in DLQ",
      alarmName: "chatbot-dlq-messages",
    });
    dlqAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));

    /** CloudWatch Dashboard */
    
    const dashboard = new cloudwatch.Dashboard(this, "ChatbotDashboard", {
      dashboardName: "contextual-chatbot-metrics",
      defaultInterval: Duration.hours(3), // Show last 3 hours by default
      periodOverride: cloudwatch.PeriodOverride.AUTO, // Auto-adapt to time range
    });

    // Row 1: API Gateway Performance
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "API Gateway - Total Requests",
        left: [apiGateway.metricCount()],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "API Gateway - Errors",
        left: [
          apiGateway.metricClientError().with({ 
            label: "4xx Client Errors", 
            color: "#FF9900" 
          }),
          apiGateway.metricServerError().with({ 
            label: "5xx Server Errors", 
            color: "#D13212" 
          }),
        ],
        width: 12,
      })
    );

    // Row 2: Lambda Errors
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Lambda Function Errors",
        left: [
          lambdaQuery.metricErrors().with({ 
            label: "Query Lambda", 
            color: "#D13212" 
          }),
          lambdaIngestionJob.metricErrors().with({ 
            label: "Ingestion Lambda", 
            color: "#FF9900" 
          }),
        ],
        width: 24,
      })
    );

    // Row 3: Lambda Performance
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Query Lambda Duration",
        left: [lambdaQuery.metricDuration()],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "Ingestion Lambda Duration",
        left: [lambdaIngestionJob.metricDuration()],
        width: 12,
      })
    );

    // Row 4: Dead Letter Queue Monitor
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Failed Ingestions (DLQ Messages)",
        left: [
          ingestionDLQ.metricApproximateNumberOfMessagesVisible().with({
            label: "Messages in DLQ",
            color: "#D13212",
          }),
        ],
        width: 24,
      })
    );

    // Row 5: Lambda Invocations
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Lambda Invocations",
        left: [
          lambdaQuery.metricInvocations().with({ label: "Query Lambda" }),
          lambdaIngestionJob.metricInvocations().with({ label: "Ingestion Lambda" }),
        ],
        width: 24,
      })
    );

    //CfnOutput is used to log API Gateway URL and S3 bucket name to console
    new CfnOutput(this, "APIGatewayUrl", {
      value: apiGateway.url,
    });

    new CfnOutput(this, "DocsBucketName", {
      value: docsBucket.bucketName,
    });

    new CfnOutput(this, "AlertTopicArn", {
      value: alertTopic.topicArn,
      description: "SNS topic for monitoring alerts (subscribe for notifications)",
    });

    new CfnOutput(this, "DashboardName", {
      value: dashboard.dashboardName,
      description: "CloudWatch Dashboard for monitoring chatbot metrics",
    });

    new CfnOutput(this, "GuardrailId", {
      value: guardrail.attrGuardrailId,
      description: "Bedrock Guardrail ID for content filtering",
    });

    new CfnOutput(this, "GuardrailVersion", {
      value: guardrail.attrVersion,
      description: "Guardrail version (DRAFT for testing, create version for production)",
    });

    new CfnOutput(this, "DLQUrl", {
      value: ingestionDLQ.queueUrl,
      description: "Dead Letter Queue for failed ingestions",
    });

    /** Frontend */

    // S3 bucket for the frontend app
    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      websiteIndexDocument: "index.html",
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
      ],
    });

    // Deploy the React app to the S3 bucket
    new s3deploy.BucketDeployment(this, "DeployFrontend", {
      sources: [
        s3deploy.Source.jsonData("config.json", {
          apiUrl: apiGateway.url,
        }),
        s3deploy.Source.asset(join(__dirname, "../../frontend"), {
          bundling: {
            image: Runtime.NODEJS_20_X.bundlingImage,
            user: "root",
            command: [
              "bash",
              "-c",
              [
                "npm install",
                "npm run build",
                "cp -r /asset-input/build/* /asset-output/",
              ].join(" && "),
            ],
          },
        }),
      ],
      destinationBucket: frontendBucket,
      distribution: distribution,
      distributionPaths: ["/*"],
    });

    new CfnOutput(this, "CloudFrontURL", {
      value: distribution.distributionDomainName,
    });
  }
}

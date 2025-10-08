import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  RemovalPolicy,
  ArnFormat,
  CustomResource,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import * as uuid from "uuid";
import { bedrock } from "@cdklabs/generative-ai-cdk-constructs";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cr from "aws-cdk-lib/custom-resources";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { join } from "path";

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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
          allowedOrigins: ["*"], // Allow all origins for pre-signed URL uploads
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
    });

    const drBucket = new s3.Bucket(this, "drbucket-" + uuid.v4(), {
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
    });

    const replicationRole = new iam.Role(this, "ReplicationRole", {
      assumedBy: new iam.ServicePrincipal("s3.amazonaws.com"),
      path: "/service-role/",
    });

    replicationRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging",
        ],
        resources: [docsBucket.arnForObjects("*")],
      })
    );

    replicationRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucket", "s3:GetReplicationConfiguration"],
        resources: [docsBucket.bucketArn],
      })
    );

    replicationRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"],
        resources: [drBucket.arnForObjects("*")],
      })
    );

    new s3.CfnBucket(this, "MyCfnBucket", {
      versioningConfiguration: {
        status: "Enabled",
      },
      replicationConfiguration: {
        role: replicationRole.roleArn,
        rules: [
          {
            destination: {
              bucket: drBucket.bucketArn,
            },
            status: "Enabled",
          },
        ],
      },
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

    /** S3 Ingest Lambda for S3 data source */

    const lambdaIngestionJob = new NodejsFunction(this, "IngestionJob", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/ingest/index.js"),
      functionName: `start-ingestion-trigger`,
      timeout: Duration.minutes(15),
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
        DATA_SOURCE_ID: s3DataSource.dataSourceId,
        BUCKET_ARN: docsBucket.bucketArn,
      },
    });

    const s3PutEventSource = new S3EventSource(docsBucket, {
      events: [s3.EventType.OBJECT_CREATED_PUT],
    });

    // Grant necessary permissions before adding event source
    docsBucket.grantRead(lambdaIngestionJob);
    
    lambdaIngestionJob.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:StartIngestionJob"],
        resources: [knowledgeBase.knowledgeBaseArn, docsBucket.bucketArn],
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
      environment: {
        KNOWLEDGE_BASE_ID: knowledgeBase.knowledgeBaseId,
      },
    });

    lambdaQuery.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:RetrieveAndGenerate",
          "bedrock:Retrieve",
          "bedrock:InvokeModel",
        ],
        resources: ["*"],
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

    /** Lambda for file upload pre-signed URLs */

    const lambdaUpload = new NodejsFunction(this, "Upload", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/upload/index.js"),
      functionName: `generate-upload-url`,
      timeout: Duration.seconds(10),
      environment: {
        DOCS_BUCKET_NAME: docsBucket.bucketName,
      },
    });

    // Grant Lambda permission to generate pre-signed URLs for the docs bucket
    docsBucket.grantPut(lambdaUpload);

    apiGateway.root
      .addResource("upload")
      .addMethod("POST", new apigw.LambdaIntegration(lambdaUpload));

    // Usage plan with throttling for basic API protection
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

    //CfnOutput is used to log API Gateway URL and S3 bucket name to console
    new CfnOutput(this, "APIGatewayUrl", {
      value: apiGateway.url,
    });

    new CfnOutput(this, "DocsBucketName", {
      value: docsBucket.bucketName,
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
        // Deploy runtime config with API URL
        s3deploy.Source.jsonData("config.json", {
          apiUrl: apiGateway.url,
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

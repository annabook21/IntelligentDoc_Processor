import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  RemovalPolicy,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as sns from "aws-cdk-lib/aws-sns";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { join } from "path";
import * as uuid from "uuid";

/**
 * SIMPLIFIED ARCHITECTURE - Following AWS Workshop Pattern (Module 05-idp-gen-ai)
 * 
 * Reference: https://catalog.workshops.aws/intelligent-document-processing/en-US/05-idp-gen-ai
 * 
 * Pattern:
 * S3 Upload → EventBridge → Lambda Function
 *                           ↓
 *                    - Textract (extract text)
 *                    - Comprehend (language, entities, phrases)
 *                    - Bedrock Claude Sonnet 4.5 (summary, insights, structured data)
 *                    - DynamoDB (store metadata)
 * 
 * Follows AWS Workshop Module 05-idp-gen-ai for Gen AI enrichment
 */
export class SimplifiedDocProcessorStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /** KMS Key for Encryption */
    const encryptionKey = new kms.Key(this, "EncryptionKey", {
      description: "KMS key for document processing encryption",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    encryptionKey.addAlias(`alias/doc-processor-${this.region}`);

    /** Dead Letter Queue for Lambda Error Handling */
    const lambdaDLQ = new sqs.Queue(this, "LambdaDLQ", {
      queueName: `lambda-dlq-${this.region}`,
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: encryptionKey,
    });

    /** S3 Bucket for Document Storage */
    const docsBucketName = `intelligent-docs-${uuid.v4()}`;
    const docsBucket = new s3.Bucket(this, "DocumentsBucket", {
      bucketName: docsBucketName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: encryptionKey,
      enforceSSL: true,
      versioned: true,
      eventBridgeEnabled: true,
      lifecycleRules: [
        {
          id: "CostOptimizationLifecycle",
          enabled: true,
          transitions: [
            { storageClass: s3.StorageClass.INTELLIGENT_TIERING, transitionAfter: Duration.days(30) },
            { storageClass: s3.StorageClass.GLACIER, transitionAfter: Duration.days(90) },
            { storageClass: s3.StorageClass.DEEP_ARCHIVE, transitionAfter: Duration.days(365) },
          ],
        },
      ],
    });

    /** DynamoDB Table for Document Metadata */
    const metadataTable = new dynamodb.Table(this, "MetadataTable", {
      partitionKey: { name: "documentId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "processingDate", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: encryptionKey,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // GSI for language-based queries
    metadataTable.addGlobalSecondaryIndex({
      indexName: "LanguageIndex",
      partitionKey: { name: "language", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "processingDate", type: dynamodb.AttributeType.STRING },
    });

    /** Lambda Function - Document Processor */
    const processorLambda = new NodejsFunction(this, "DocumentProcessor", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/document-processor.js"),
      functionName: `doc-processor-${this.region}`,
      timeout: Duration.minutes(5),
      environment: {
        METADATA_TABLE_NAME: metadataTable.tableName,
      },
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
    });

    // Grant permissions
    docsBucket.grantRead(processorLambda);
    metadataTable.grantWriteData(processorLambda);
    encryptionKey.grantEncryptDecrypt(processorLambda);
    
    // Grant Textract, Comprehend, and Bedrock permissions
    processorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "textract:DetectDocumentText",
          "textract:AnalyzeDocument",
          "comprehend:DetectDominantLanguage",
          "comprehend:DetectEntities",
          "comprehend:ExtractKeyPhrases",
          "bedrock:InvokeModel",
        ],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-sonnet-4-5-20250929-v1:0`,
        ],
      })
    );

    /** EventBridge Rule - Trigger Lambda on S3 Upload */
    const processingRule = new events.Rule(this, "DocumentProcessingRule", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: { name: [docsBucket.bucketName] },
        },
      },
    });

    processingRule.addTarget(
      new targets.LambdaFunction(processorLambda, {
        retryAttempts: 3,
        maxEventAge: Duration.minutes(15),
      })
    );

    /** Lambda Function - Search API Handler */
    const searchLambda = new NodejsFunction(this, "SearchHandler", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/search-handler.js"),
      functionName: `doc-search-${this.region}`,
      timeout: Duration.seconds(30),
      environment: {
        METADATA_TABLE_NAME: metadataTable.tableName,
      },
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
    });

    metadataTable.grantReadData(searchLambda);
    encryptionKey.grantDecrypt(searchLambda);

    /** API Gateway */
    const api = new apigw.RestApi(this, "DocumentProcessorAPI", {
      restApiName: `doc-processor-api-${this.region}`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowHeaders: ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key"],
        allowMethods: apigw.Cors.ALL_METHODS,
      },
      deployOptions: {
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        dataTraceEnabled: false,
      },
    });

    const apiIntegration = new apigw.LambdaIntegration(searchLambda);

    // Search endpoint
    const searchResource = api.root.addResource("search");
    searchResource.addMethod("GET", apiIntegration, {
      authorizationType: apigw.AuthorizationType.IAM,
    });
    searchResource.addMethod("POST", apiIntegration, {
      authorizationType: apigw.AuthorizationType.IAM,
    });

    // Metadata endpoint
    const metadataResource = api.root.addResource("metadata").addResource("{documentId}");
    metadataResource.addMethod("GET", apiIntegration, {
      authorizationType: apigw.AuthorizationType.IAM,
    });

    // Health endpoint (public for monitoring)
    api.root.addResource("health").addMethod("GET", apiIntegration);

    /** CloudWatch Monitoring */
    const alertTopic = new sns.Topic(this, "AlertTopic", {
      displayName: "Document Processing Alerts",
      topicName: `doc-processing-alerts-${this.region}`,
    });

    // DLQ Alarm
    const dlqAlarm = new cloudwatch.Alarm(this, "DLQMessagesAlarm", {
      metric: lambdaDLQ.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Alert when Lambda functions fail and messages go to DLQ",
      alarmName: `lambda-dlq-messages-${this.region}`,
    });
    dlqAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));

    // Lambda Error Alarm
    const processorErrorAlarm = new cloudwatch.Alarm(this, "ProcessorErrorAlarm", {
      metric: processorLambda.metricErrors({ period: Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: "Alert when document processing fails",
      alarmName: `doc-processor-errors-${this.region}`,
    });
    processorErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));

    const dashboard = new cloudwatch.Dashboard(this, "ProcessorDashboard", {
      dashboardName: `doc-processor-metrics-${this.region}`,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Document Processing",
        left: [
          processorLambda.metricInvocations().with({ label: "Total" }),
          processorLambda.metricErrors().with({ label: "Errors", color: "#D13212" }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "DLQ Messages",
        left: [
          lambdaDLQ.metricApproximateNumberOfMessagesVisible().with({ label: "DLQ Depth", color: "#FF9900" }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: "API Gateway Requests",
        left: [
          api.metricCount().with({ label: "Total Requests" }),
          api.metricClientError().with({ label: "4XX Errors", color: "#FF9900" }),
          api.metricServerError().with({ label: "5XX Errors", color: "#D13212" }),
        ],
        width: 12,
      })
    );

    /** Outputs */
    new CfnOutput(this, "DocumentsBucketName", { value: docsBucket.bucketName });
    new CfnOutput(this, "APIEndpoint", { value: api.url });
    new CfnOutput(this, "DashboardName", { value: dashboard.dashboardName });
    new CfnOutput(this, "DLQQueueUrl", { value: lambdaDLQ.queueUrl });
  }
}


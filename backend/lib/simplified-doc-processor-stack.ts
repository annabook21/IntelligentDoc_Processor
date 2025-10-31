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
import { CfnGlobalTable } from "aws-cdk-lib/aws-dynamodb";
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

    /** DynamoDB Global Table for Document Metadata (Multi-Region DR)
     * 
     * Following AWS Best Practices:
     * - https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_reqs_bestpractices.html
     * - Uses Global Tables version 2019.11.21 (latest)
     * - Active-active replication across regions
     * - Automatic failover capability
     * 
     * Replicas: Primary region + DR region (us-east-2)
     * You can add more regions by adding to the replicas array
     */
    
    // Get DR region from environment or default to us-east-2
    const drRegion = process.env.DR_REGION || "us-east-2";
    const primaryRegion = this.region;
    
    // DynamoDB Global Table - Multi-region with automatic replication
    const globalTable = new CfnGlobalTable(this, "MetadataGlobalTable", {
      tableName: `document-metadata-${primaryRegion}`,
      billingMode: "PAY_PER_REQUEST",
      globalSecondaryIndexes: [
        {
          indexName: "LanguageIndex",
          keySchema: [
            { attributeName: "language", keyType: "HASH" },
            { attributeName: "processingDate", keyType: "RANGE" },
          ],
          projection: {
            projectionType: "ALL",
          },
        },
      ],
      keySchema: [
        { attributeName: "documentId", keyType: "HASH" },
        { attributeName: "processingDate", keyType: "RANGE" },
      ],
      attributeDefinitions: [
        { attributeName: "documentId", attributeType: "S" },
        { attributeName: "processingDate", attributeType: "S" },
        { attributeName: "language", attributeType: "S" },
      ],
      replicas: [
        {
          region: primaryRegion,
          pointInTimeRecoverySpecification: {
            pointInTimeRecoveryEnabled: true,
          },
          // AWS-managed encryption (alias/aws/dynamodb) - available in all regions
          // AWS Documentation: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/globaltables-security.html
          // All replicas must use the same type (AWS-managed, AWS-owned, or customer-managed)
          // Using AWS-managed for simplicity and automatic availability in all regions
          sseSpecification: {
            kmsMasterKeyId: "alias/aws/dynamodb",
          },
          deletionProtectionEnabled: true,
          tags: [
            { key: "Purpose", value: "DocumentMetadata" },
            { key: "RegionType", value: "Primary" },
          ],
        },
        {
          region: drRegion,
          pointInTimeRecoverySpecification: {
            pointInTimeRecoveryEnabled: true,
          },
          // AWS-managed encryption - same key alias available in all regions
          // This ensures both replicas use the same encryption type (required by AWS)
          sseSpecification: {
            kmsMasterKeyId: "alias/aws/dynamodb",
          },
          deletionProtectionEnabled: true,
          tags: [
            { key: "Purpose", value: "DocumentMetadata" },
            { key: "RegionType", value: "DR" },
          ],
        },
      ],
      streamSpecification: {
        streamViewType: "NEW_AND_OLD_IMAGES",
      },
      // Global Tables Version 2019.11.21 (latest - recommended by AWS)
      // AWS Documentation: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_reqs_bestpractices.html
      // This version enables better performance and features
    });

    // Create a reference to the table for Lambda permissions
    // Note: Global Tables creates replicas, we reference by table name
    // Lambda will use the table name and connect to local region replica
    const metadataTableName = globalTable.tableName || `document-metadata-${primaryRegion}`;

    /** Lambda Function - Document Processor */
    const processorLambda = new NodejsFunction(this, "DocumentProcessor", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/document-processor.js"),
      functionName: `doc-processor-${this.region}`,
      timeout: Duration.minutes(5),
      environment: {
        METADATA_TABLE_NAME: metadataTableName,
      },
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
    });

    // Grant permissions
    docsBucket.grantRead(processorLambda);
    
    // Grant DynamoDB permissions to Global Table (by table name)
    processorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${metadataTableName}`,
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${metadataTableName}/index/*`,
          // DR region access (if Lambda needs to access DR region directly)
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${metadataTableName}`,
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${metadataTableName}/index/*`,
        ],
      })
    );
    
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
        METADATA_TABLE_NAME: metadataTableName,
      },
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
    });

    // Grant DynamoDB read permissions to Global Table
    searchLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${metadataTableName}`,
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${metadataTableName}/index/*`,
          // DR region access (if Lambda needs to access DR region directly)
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${metadataTableName}`,
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${metadataTableName}/index/*`,
        ],
      })
    );
    
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
    new CfnOutput(this, "MetadataTableName", { 
      value: metadataTableName,
      description: "DynamoDB Global Table name (replicated to primary and DR regions)",
    });
    new CfnOutput(this, "PrimaryRegion", { value: primaryRegion });
    new CfnOutput(this, "DRRegion", { value: drRegion });
    new CfnOutput(this, "GlobalTableArn", {
      value: globalTable.attrArn || "",
      description: "DynamoDB Global Table ARN",
    });
  }
}


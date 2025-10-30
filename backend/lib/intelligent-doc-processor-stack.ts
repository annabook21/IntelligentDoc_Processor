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
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as sns from "aws-cdk-lib/aws-sns";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as cr from "aws-cdk-lib/custom-resources";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { join } from "path";
import * as uuid from "uuid";

/**
 * CORRECTED ARCHITECTURE - Following AWS Bedrock Flows Samples Pattern
 * 
 * Reference: https://github.com/aws-samples/amazon-bedrock-flows-samples
 * 
 * Pattern:
 * S3 Event → EventBridge → Bedrock Flow (direct invocation)
 * Flow orchestrates: Prompt nodes, Lambda tools, Conditional logic
 * 
 * Lambda Functions:
 * - flow-creator.js (infrastructure - custom resource)
 * - flow-invoker.js (EventBridge target - minimal bridge)
 * - tool lambdas (only if Flow needs them)
 * - api-handler.js (consolidated API)
 */
export class IntelligentDocProcessorStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // [S3, DynamoDB, OpenSearch setup - same as before...]
    const docsBucketName = `intelligent-docs-${uuid.v4()}`;
    const docsBucket = new s3.Bucket(this, "DocumentsBucket", {
      bucketName: docsBucketName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
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

    const metadataTable = new dynamodb.Table(this, "DocumentMetadataTable", {
      tableName: `document-metadata-${this.region}`,
      partitionKey: { name: "documentId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "processingDate", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    metadataTable.addGlobalSecondaryIndex({
      indexName: "LanguageIndex",
      partitionKey: { name: "language", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "processingDate", type: dynamodb.AttributeType.STRING },
    });

    const opensearchDomain = new opensearch.Domain(this, "SearchDomain", {
      domainName: `document-search-${this.region.toLowerCase().replace(/_/g, "-")}`,
      version: opensearch.EngineVersion.OPENSEARCH_2_3,
      capacity: { dataNodes: 1, dataNodeInstanceType: "t3.small.search" },
      ebs: { volumeSize: 20, volumeType: opensearch.EbsDeviceVolumeType.GP3 },
      zoneAwareness: { enabled: false },
      encryption: { encryptionAtRest: { enabled: true }, nodeToNodeEncryption: true },
      enforceHttps: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    /** Custom Resource Lambda to Create Bedrock Flow */
    const flowCreatorLambda = new NodejsFunction(this, "BedrockFlowCreator", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../flows/flow-creator.js"),
      functionName: `bedrock-flow-creator-${this.region}`,
      timeout: Duration.minutes(5),
      environment: {
        METADATA_TABLE_NAME: metadataTable.tableName,
        OPENSEARCH_ENDPOINT: opensearchDomain.domainEndpoint,
        DOCS_BUCKET_NAME: docsBucket.bucketName,
      },
    });

    flowCreatorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:CreateFlow",
          "bedrock:GetFlow",
          "bedrock:UpdateFlow",
          "bedrock:DeleteFlow",
          "bedrock:ListFlows",
        ],
        resources: ["*"],
      })
    );

    const flowProvider = new cr.Provider(this, "BedrockFlowProvider", {
      onEventHandler: flowCreatorLambda,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const flowResource = new CustomResource(this, "DocumentProcessingFlow", {
      serviceToken: flowProvider.serviceToken,
      properties: {
        FlowName: `document-processing-flow-${this.region}`,
        Description: "Processes documents to extract entities, keywords, and metadata",
      },
    });

    /** EventBridge Rule - Invoke Flow directly when S3 object created */
    const flowInvokerLambda = new NodejsFunction(this, "FlowInvoker", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../flows/flow-invoker.js"),
      functionName: `flow-invoker-${this.region}`,
      timeout: Duration.minutes(5),
      environment: {
        FLOW_ID: flowResource.getAttString("FlowId"),
        METADATA_TABLE_NAME: metadataTable.tableName,
      },
    });

    // Grant permission to invoke Flow
    flowInvokerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock-runtime:InvokeFlow"],
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:flow/*`,
        ],
      })
    );

    docsBucket.grantRead(flowInvokerLambda);
    metadataTable.grantWriteData(flowInvokerLambda);

    const processingRule = new events.Rule(this, "DocumentProcessingRule", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: { name: [docsBucket.bucketName] },
        },
      },
    });

    processingRule.addTarget(new targets.LambdaFunction(flowInvokerLambda));

    /** Consolidated API Handler */
    const apiHandlerLambda = new NodejsFunction(this, "APIHandler", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../flows/api-handler.js"),
      functionName: `doc-processor-api-${this.region}`,
      timeout: Duration.seconds(30),
      environment: {
        OPENSEARCH_ENDPOINT: opensearchDomain.domainEndpoint,
        METADATA_TABLE_NAME: metadataTable.tableName,
      },
    });

    opensearchDomain.grantReadWrite(apiHandlerLambda);
    metadataTable.grantReadData(apiHandlerLambda);

    const api = new apigw.RestApi(this, "DocumentProcessorAPI", {
      restApiName: `doc-processor-api-${this.region}`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowHeaders: ["Content-Type", "X-Amz-Date", "Authorization"],
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });

    const apiIntegration = new apigw.LambdaIntegration(apiHandlerLambda);
    api.root.addResource("search").addMethod("GET", apiIntegration);
    api.root.addResource("search").addMethod("POST", apiIntegration);
    api.root.addResource("metadata").addResource("{documentId}").addMethod("GET", apiIntegration);
    api.root.addResource("health").addMethod("GET", apiIntegration);

    /** CloudWatch Monitoring */
    const alertTopic = new sns.Topic(this, "AlertTopic", {
      displayName: "Document Processing Alerts",
      topicName: `doc-processing-alerts-${this.region}`,
    });

    const flowErrorAlarm = new cloudwatch.Alarm(this, "FlowErrorAlarm", {
      metric: flowInvokerLambda.metricErrors({ period: Duration.minutes(5) }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: "Alert when Flow invocations fail",
      alarmName: `doc-processing-flow-errors-${this.region}`,
    });
    flowErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));

    const dashboard = new cloudwatch.Dashboard(this, "ProcessorDashboard", {
      dashboardName: `doc-processor-metrics-${this.region}`,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Flow Invocations",
        left: [
          flowInvokerLambda.metricInvocations().with({ label: "Total" }),
          flowInvokerLambda.metricErrors().with({ label: "Errors", color: "#D13212" }),
        ],
        width: 24,
      })
    );

    /** Outputs */
    new CfnOutput(this, "DocumentsBucketName", { value: docsBucket.bucketName });
    new CfnOutput(this, "APIEndpoint", { value: api.url });
    new CfnOutput(this, "FlowId", { value: flowResource.getAttString("FlowId") });
    new CfnOutput(this, "DashboardName", { value: dashboard.dashboardName });
  }
}


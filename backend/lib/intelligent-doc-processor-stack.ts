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
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as logs from "aws-cdk-lib/aws-logs";
import * as kms from "aws-cdk-lib/aws-kms";
import * as cloudtrail from "aws-cdk-lib/aws-cloudtrail";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
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

    /** KMS Keys for Encryption */
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

    /** CloudTrail for Audit Logging */
    // Note: Using auto-generated name to avoid conflicts with existing trails
    const trail = new cloudtrail.Trail(this, "CloudTrail", {
      enableFileValidation: true,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: false,
      // Note: omit encryptionKey to avoid KMS permission issues; CloudTrail will use SSE-S3
    });
    trail.applyRemovalPolicy(RemovalPolicy.RETAIN);

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
      // TODO: Configure server access logs to separate bucket for audit
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
      partitionKey: { name: "documentId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "processingDate", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: encryptionKey,
    });

    metadataTable.addGlobalSecondaryIndex({
      indexName: "LanguageIndex",
      partitionKey: { name: "language", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "processingDate", type: dynamodb.AttributeType.STRING       },
    });

    /** VPC for OpenSearch (Compliance with SCP - No Public Endpoints) */
    const vpc = new ec2.Vpc(this, "DocProcessorVPC", {
      maxAzs: 2,
      natGateways: 1, // Single NAT gateway for cost optimization
      subnetConfiguration: [
        {
          name: "PrivateSubnet",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: "PublicSubnet",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // VPC Endpoints for Lambda in VPC to access AWS services without internet
    // S3 Gateway endpoint (free, no cost)
    vpc.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // DynamoDB Gateway endpoint (free, no cost)
    vpc.addGatewayEndpoint("DynamoDBEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    // Interface endpoint for OpenSearch service
    const opensearchSecurityGroup = new ec2.SecurityGroup(this, "OpenSearchSecurityGroup", {
      vpc: vpc,
      description: "Security group for OpenSearch domain",
      allowAllOutbound: false,
    });

    // OpenSearch Domain in VPC (Private endpoint only - no public access)
    const opensearchDomain = new opensearch.Domain(this, "SearchDomain", {
      version: opensearch.EngineVersion.OPENSEARCH_2_3,
      capacity: { dataNodes: 2, dataNodeInstanceType: "t3.small.search" }, // Multi-AZ requires 2+ nodes
      ebs: { volumeSize: 20 },
      zoneAwareness: {
        enabled: true,
        availabilityZoneCount: 2, // Multi-AZ for HA
      },
      encryptionAtRest: { enabled: true, kmsKey: encryptionKey },
      nodeToNodeEncryption: true,
      enforceHttps: true,
      removalPolicy: RemovalPolicy.RETAIN,
      // VPC Configuration - NO PUBLIC ENDPOINT
      // AWS Documentation: https://docs.aws.amazon.com/opensearch-service/latest/developerguide/vpc.html
      // CDK API: vpc, vpcSubnets, securityGroups properties verified against TypeScript definitions
      // Verified in: node_modules/aws-cdk-lib/aws-opensearchservice/lib/domain.d.ts
      vpc: vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      securityGroups: [opensearchSecurityGroup],
      // Disable fine-grained access control for simplicity (can enable later with IAM roles)
      // Note: With VPC, access is controlled via security groups
      accessPolicies: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.AnyPrincipal()],
          actions: ["es:*"],
          resources: ["*"],
        }),
      ],
      // Note: Automated snapshots are enabled by default in OpenSearch
      // Configuration via API: https://docs.aws.amazon.com/opensearch-service/latest/developerguide/automated-snapshots.html
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
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
      // Note: Lambda environment variables can be encrypted using KMS
      // This requires configuring the Lambda service via AWS Console or API
      // See: https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-encryption
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
        resources: [
          `arn:aws:bedrock:${this.region}:${this.account}:flow/*`,
        ],
      })
    );

    const flowProvider = new cr.Provider(this, "BedrockFlowProvider", {
      onEventHandler: flowCreatorLambda,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Execution role for Bedrock Flow
    const flowExecutionRole = new iam.Role(this, "BedrockFlowExecutionRole", {
      assumedBy: new iam.ServicePrincipal("bedrock.amazonaws.com"),
      description: "Execution role for Bedrock Flow runtime",
    });
    // Minimal example permissions; expand with tool integrations as flow evolves
    flowExecutionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
    );
    // Allow invoking flows and using Bedrock runtime as needed (tighten as required)
    flowExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeFlow",
        ],
        resources: ["*"]
      })
    );
    // Read from S3 docs bucket if tools are added later
    docsBucket.grantRead(flowExecutionRole);

    const flowResource = new CustomResource(this, "DocumentProcessingFlow", {
      serviceToken: flowProvider.serviceToken,
      properties: {
        FlowName: `document-processing-flow-${this.region}`,
        Description: "Processes documents to extract entities, keywords, and metadata",
        ExecutionRoleArn: flowExecutionRole.roleArn,
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
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
      // Note: Lambda environment variables can be encrypted using KMS
      // See: https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-encryption
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

    // S3 events are sent to EventBridge via eventBridgeEnabled: true on the bucket

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
      new targets.LambdaFunction(flowInvokerLambda, {
        retryAttempts: 3,
        maxEventAge: Duration.minutes(15),
      })
    );

    /** Lambda Security Group for accessing OpenSearch in VPC */
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, "LambdaSecurityGroup", {
      vpc: vpc,
      description: "Security group for Lambda functions accessing OpenSearch",
      allowAllOutbound: true,
    });

    // Allow Lambda to access OpenSearch on HTTPS port
    opensearchSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(443),
      "Allow HTTPS from Lambda"
    );

    /** Consolidated API Handler */
    // Note: Deployed in VPC to access private OpenSearch endpoint
    const apiHandlerLambda = new NodejsFunction(this, "APIHandler", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../flows/api-handler.js"),
      functionName: `doc-processor-api-${this.region}`,
      timeout: Duration.seconds(30),
      environment: {
        OPENSEARCH_ENDPOINT: opensearchDomain.domainEndpoint,
        METADATA_TABLE_NAME: metadataTable.tableName,
      },
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
      // VPC Configuration - Required to access OpenSearch in private subnets
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      // Note: Lambda environment variables can be encrypted using KMS
      // See: https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-encryption
    });

    opensearchDomain.grantReadWrite(apiHandlerLambda);
    metadataTable.grantReadData(apiHandlerLambda);

    // Grant KMS permissions so Lambda functions can access KMS-encrypted resources
    // (S3, DynamoDB, OpenSearch all use the same encryption key)
    // NOTE: Must be after all Lambda functions are defined
    encryptionKey.grantEncryptDecrypt(flowCreatorLambda);
    encryptionKey.grantEncryptDecrypt(flowInvokerLambda);
    encryptionKey.grantEncryptDecrypt(apiHandlerLambda);

    const api = new apigw.RestApi(this, "DocumentProcessorAPI", {
      restApiName: `doc-processor-api-${this.region}`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS, // TODO: Restrict to specific origins in production
        allowHeaders: ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key"],
        allowMethods: apigw.Cors.ALL_METHODS,
      },
      deployOptions: {
        throttlingRateLimit: 100, // Requests per second per account
        throttlingBurstLimit: 200, // Burst capacity
        dataTraceEnabled: false, // Disable for security (don't log request/response bodies)
      },
      // Note: IAM authentication is configured on individual methods below
    });

    const apiIntegration = new apigw.LambdaIntegration(apiHandlerLambda);
    
    // API Gateway endpoints with IAM authentication
    // Note: For production, consider Cognito or API Keys based on use case
    const searchResource = api.root.addResource("search");
    searchResource.addMethod("GET", apiIntegration, {
      authorizationType: apigw.AuthorizationType.IAM,
    });
    searchResource.addMethod("POST", apiIntegration, {
      authorizationType: apigw.AuthorizationType.IAM,
    });
    
    const metadataResource = api.root.addResource("metadata").addResource("{documentId}");
    metadataResource.addMethod("GET", apiIntegration, {
      authorizationType: apigw.AuthorizationType.IAM,
    });
    
    // Health endpoint remains public (no auth) for monitoring tools
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

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Flow Invocations",
        left: [
          flowInvokerLambda.metricInvocations().with({ label: "Total" }),
          flowInvokerLambda.metricErrors().with({ label: "Errors", color: "#D13212" }),
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
      }),
      new cloudwatch.GraphWidget({
        title: "Lambda Errors",
        left: [
          flowCreatorLambda.metricErrors().with({ label: "Flow Creator", color: "#D13212" }),
          flowInvokerLambda.metricErrors().with({ label: "Flow Invoker", color: "#D13212" }),
          apiHandlerLambda.metricErrors().with({ label: "API Handler", color: "#D13212" }),
        ],
        width: 12,
      })
    );

    /** Outputs */
    new CfnOutput(this, "DocumentsBucketName", { value: docsBucket.bucketName });
    new CfnOutput(this, "APIEndpoint", { value: api.url });
    new CfnOutput(this, "FlowId", { value: flowResource.getAttString("FlowId") });
    new CfnOutput(this, "DashboardName", { value: dashboard.dashboardName });
    new CfnOutput(this, "CloudTrailArn", { value: trail.trailArn });
    new CfnOutput(this, "DLQQueueUrl", { value: lambdaDLQ.queueUrl });
    new CfnOutput(this, "VPCId", { value: vpc.vpcId });
    new CfnOutput(this, "OpenSearchVpcEndpoint", { 
      value: opensearchDomain.domainEndpoint,
      description: "OpenSearch domain endpoint (VPC-only, no public access)",
    });
  }
}


import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  RemovalPolicy,
  CustomResource,
} from "aws-cdk-lib";
import * as cr from "aws-cdk-lib/custom-resources";
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
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { join } from "path";
import * as uuid from "uuid";

/**
 * SIMPLIFIED ARCHITECTURE - Following AWS Workshop Pattern (Module 05-idp-gen-ai)
 * 
 * Reference: https://catalog.workshops.aws/intelligent-document-processing/en-US/05-idp-gen-ai
 * 
 * Pattern:
 * S3 Upload → EventBridge → Step Functions Orchestration
 *                                         ↓
 *                                  - Textract (asynchronous)
 *                                  - Comprehend (language, entities, phrases)
 *                                  - Bedrock Claude Sonnet (summary, insights)
 *                                  - DynamoDB (store metadata)
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

    encryptionKey.addAlias(`alias/doc-processor-${this.region}-${uuid.v4().substring(0, 8)}`);

    // Allow Amazon Textract to use the KMS key when reading encrypted objects from S3 (per AWS Textract docs)
    encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowTextractUseOfKey",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("textract.amazonaws.com")],
        actions: ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": this.account,
          },
          StringLike: {
            "aws:SourceArn": `arn:aws:textract:${this.region}:${this.account}:*`,
          },
        },
      })
    );

    /** Dead Letter Queue for Lambda Error Handling */
    const lambdaDLQ = new sqs.Queue(this, "LambdaDLQ", {
      queueName: `lambda-dlq-${this.region}-${uuid.v4().substring(0, 8)}`,
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: encryptionKey,
    });

    /** S3 Bucket for Document Storage */
    // Use deterministic bucket name (no UUID) to prevent bucket recreation on each deployment
    // This ensures documents persist across deployments
    // Note: S3 bucket names must be globally unique, so we include account ID
    const accountId = Stack.of(this).account;
    const regionShort = this.region.replace(/-/g, "");
    const docsBucketName = `intelligent-docs-${accountId}-${regionShort}-${uuid.v4().substring(0, 8)}`; // e.g., intelligent-docs-232894901916-uswest2
    const docsBucket = new s3.Bucket(this, "DocumentsBucket", {
      bucketName: docsBucketName,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: encryptionKey,
      enforceSSL: true,
      versioned: true,
      eventBridgeEnabled: true,
      // CORS configuration for presigned URL uploads from browser
      // Required for browser to upload directly to S3 via presigned URLs
      // Reference: https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ["*"], // Allow all origins for presigned URL uploads (browsers)
          allowedHeaders: ["*"], // Allow all headers (needed for presigned URL signatures, KMS encryption headers)
          exposedHeaders: ["ETag"], // Expose ETag for upload verification
          maxAge: 3000, // Cache preflight response for 50 minutes
        },
      ],
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

    // Allow Amazon Textract service to read encrypted objects
    docsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowTextractReadObjects",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("textract.amazonaws.com")],
        actions: ["s3:GetObject", "s3:GetObjectVersion"],
        resources: [`${docsBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": this.account,
          },
          StringLike: {
            "aws:SourceArn": `arn:aws:textract:${this.region}:${this.account}:*`,
          },
        },
      })
    );

    docsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowTextractGetBucketLocation",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("textract.amazonaws.com")],
        actions: ["s3:GetBucketLocation"],
        resources: [docsBucket.bucketArn],
        conditions: {
          StringEquals: {
            "aws:SourceAccount": this.account,
          },
          StringLike: {
            "aws:SourceArn": `arn:aws:textract:${this.region}:${this.account}:*`,
          },
        },
      })
    );

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
    // Use deterministic table name (no UUID) to prevent table recreation on each deployment
    // This ensures documents persist across deployments
    const globalTable = new CfnGlobalTable(this, "MetadataGlobalTable", {
      tableName: `document-metadata-${primaryRegion.replace(/-/g, "")}-${uuid.v4().substring(0, 8)}`, // Unique name: document-metadata-uswest2-a1b2c3d4
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
          // Using AWS-managed encryption (default) - omit sseSpecification for default encryption
          // AWS Documentation: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/globaltables-security.html
          // All replicas must use the same encryption type (default AWS-managed when sseSpecification is omitted)
          // When using default SSE, sseSpecification must be null/omitted
          // Deletion protection disabled during initial testing - can be enabled after verification
          deletionProtectionEnabled: false,
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
          // AWS-managed encryption (default) - same as primary region
          // Omitting sseSpecification uses AWS-managed encryption automatically
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

    // DynamoDB Global Table for Document Name Mapping
    // Maps user-friendly documentId (UUID) to S3 key and user-provided document name
    // This prevents exposing sensitive S3 bucket names and paths to end users
    const documentNameTableName = `document-names-${primaryRegion.replace(/-/g, "")}-${uuid.v4().substring(0, 8)}`;
    
    const documentNameTable = new CfnGlobalTable(this, "DocumentNameGlobalTable", {
      tableName: documentNameTableName,
      billingMode: "PAY_PER_REQUEST",
      keySchema: [{ attributeName: "documentId", keyType: "HASH" }],
      attributeDefinitions: [
        { attributeName: "documentId", attributeType: "S" },
        { attributeName: "s3Key", attributeType: "S" },
      ],
      globalSecondaryIndexes: [
        {
          indexName: "S3KeyIndex",
          keySchema: [{ attributeName: "s3Key", keyType: "HASH" }],
          projection: {
            projectionType: "ALL",
          },
        },
      ],
      replicas: [
        {
          region: primaryRegion,
          pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
          deletionProtectionEnabled: false,
          tags: [
            { key: "Purpose", value: "DocumentNameMapping" },
            { key: "RegionType", value: "Primary" },
          ],
        },
        {
          region: drRegion,
          pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
          deletionProtectionEnabled: true,
          tags: [
            { key: "Purpose", value: "DocumentNameMapping" },
            { key: "RegionType", value: "DR" },
          ],
        },
      ],
      streamSpecification: {
        streamViewType: "NEW_AND_OLD_IMAGES",
      },
    });

    // Hash registry table for duplicate detection (Global Table for DR compliance)
    const hashTableName = `document-hash-registry-${primaryRegion.replace(/-/g, "")}-${uuid.v4().substring(0, 8)}`;

    const hashRegistryTable = new CfnGlobalTable(this, "HashRegistryGlobalTable", {
      tableName: hashTableName,
      billingMode: "PAY_PER_REQUEST",
      keySchema: [{ attributeName: "contentHash", keyType: "HASH" }],
      attributeDefinitions: [{ attributeName: "contentHash", attributeType: "S" }],
      streamSpecification: {
        streamViewType: "NEW_AND_OLD_IMAGES",
      },
      replicas: [
        {
          region: primaryRegion,
          pointInTimeRecoverySpecification: {
            pointInTimeRecoveryEnabled: true,
          },
          deletionProtectionEnabled: false,
        },
        {
          region: drRegion,
          pointInTimeRecoverySpecification: {
            pointInTimeRecoveryEnabled: true,
          },
          deletionProtectionEnabled: true,
        },
      ],
    });

    /** Lambda Functions for Step Functions Orchestration */
    const duplicateCheckLambda = new NodejsFunction(this, "DuplicateCheck", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/check-duplicate.js"),
      functionName: `doc-duplicate-check-${this.region}-${uuid.v4().substring(0, 8)}`,
      timeout: Duration.minutes(1),
      environment: {
        HASH_TABLE_NAME: hashTableName,
      },
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
    });

    duplicateCheckLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${hashTableName}`,
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${hashTableName}`,
        ],
      })
    );

    docsBucket.grantRead(duplicateCheckLambda);
    encryptionKey.grantDecrypt(duplicateCheckLambda);
    const textractStartLambda = new NodejsFunction(this, "TextractStart", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/textract-start.js"),
      functionName: `doc-textract-start-${this.region}-${uuid.v4().substring(0, 8)}`,
      timeout: Duration.seconds(30),
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
    });

    textractStartLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["textract:StartDocumentTextDetection"],
        resources: ["*"],
      })
    );

    // Allow the invoking Lambda role to use the KMS key for encrypted documents
    encryptionKey.grantEncryptDecrypt(textractStartLambda);
    docsBucket.grantRead(textractStartLambda);

    const textractStatusLambda = new NodejsFunction(this, "TextractStatus", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/textract-status.js"),
      functionName: `doc-textract-status-${this.region}-${uuid.v4().substring(0, 8)}`,
      timeout: Duration.seconds(30),
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
    });

    textractStatusLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["textract:GetDocumentTextDetection"],
        resources: ["*"],
      })
    );

    const comprehendLambda = new NodejsFunction(this, "ComprehendAnalyze", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/comprehend-analyze.js"),
      functionName: `doc-comprehend-${this.region}-${uuid.v4().substring(0, 8)}`,
      timeout: Duration.seconds(30),
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
    });

    comprehendLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "comprehend:DetectDominantLanguage",
          "comprehend:DetectEntities",
          "comprehend:DetectKeyPhrases",
        ],
        resources: ["*"],
      })
    );

    const bedrockLambda = new NodejsFunction(this, "BedrockSummarize", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/bedrock-summarize.js"),
      functionName: `doc-bedrock-${this.region}-${uuid.v4().substring(0, 8)}`,
      timeout: Duration.seconds(45),
      environment: {
        BEDROCK_MODEL_ID: "anthropic.claude-3-sonnet-20240229-v1:0",
      },
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
    });

    bedrockLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    const storeMetadataLambda = new NodejsFunction(this, "StoreMetadata", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/store-metadata.js"),
      functionName: `doc-store-${this.region}-${uuid.v4().substring(0, 8)}`,
      timeout: Duration.seconds(30),
      environment: {
        METADATA_TABLE_NAME: metadataTableName,
        DOCUMENT_NAME_TABLE: documentNameTableName,
      },
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
    });

    storeMetadataLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:PutItem"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${metadataTableName}`,
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${metadataTableName}`,
        ],
      })
    );
    
    // Grant query permissions to document name table (for S3Key lookup)
    storeMetadataLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:Query"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${documentNameTableName}`,
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${documentNameTableName}/index/*`,
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${documentNameTableName}`,
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${documentNameTableName}/index/*`,
        ],
      })
    );

    /** Step Functions State Machine following AWS IDP reference architecture */
    const prepareInput = new sfn.Pass(this, "PrepareInput", {
      parameters: {
        bucket: sfn.JsonPath.stringAt("$.detail.bucket.name"),
        key: sfn.JsonPath.stringAt("$.detail.object.key"),
        region: this.region,
      },
    });

    const checkDuplicateTask = new tasks.LambdaInvoke(this, "CheckDuplicate", {
      lambdaFunction: duplicateCheckLambda,
      payload: sfn.TaskInput.fromObject({
        bucket: sfn.JsonPath.stringAt("$.bucket"),
        key: sfn.JsonPath.stringAt("$.key"),
      }),
      resultPath: "$.duplicateCheck",
    });

    const startTextractTask = new tasks.LambdaInvoke(this, "StartTextract", {
      lambdaFunction: textractStartLambda,
      payload: sfn.TaskInput.fromObject({
        bucket: sfn.JsonPath.stringAt("$.bucket"),
        key: sfn.JsonPath.stringAt("$.key"),
      }),
      resultPath: "$.textractStart",
    });

    const waitForTextract = new sfn.Wait(this, "WaitForTextract", {
      time: sfn.WaitTime.duration(Duration.seconds(10)),
    });

    const getTextractStatus = new tasks.LambdaInvoke(this, "GetTextractStatus", {
      lambdaFunction: textractStatusLambda,
      payload: sfn.TaskInput.fromObject({
        jobId: sfn.JsonPath.stringAt("$.textractStart.Payload.jobId"),
      }),
      resultPath: "$.textractStatus",
    });

    const comprehendTask = new tasks.LambdaInvoke(this, "AnalyzeWithComprehend", {
      lambdaFunction: comprehendLambda,
      payload: sfn.TaskInput.fromObject({
        text: sfn.JsonPath.stringAt("$.textractStatus.Payload.text"),
      }),
      resultPath: "$.comprehend",
    });

    const bedrockTask = new tasks.LambdaInvoke(this, "SummarizeWithBedrock", {
      lambdaFunction: bedrockLambda,
      payload: sfn.TaskInput.fromObject({
        text: sfn.JsonPath.stringAt("$.textractStatus.Payload.text"),
      }),
      resultPath: "$.bedrock",
    });

    const storeMetadataTask = new tasks.LambdaInvoke(this, "StoreMetadataTask", {
      lambdaFunction: storeMetadataLambda,
      payload: sfn.TaskInput.fromObject({
        bucket: sfn.JsonPath.stringAt("$.bucket"),
        key: sfn.JsonPath.stringAt("$.key"),
        text: sfn.JsonPath.stringAt("$.textractStatus.Payload.text"),
        language: sfn.JsonPath.stringAt("$.comprehend.Payload.language"),
        entities: sfn.JsonPath.objectAt("$.comprehend.Payload.entities"), // Changed from stringAt to objectAt to preserve array structure
        keyPhrases: sfn.JsonPath.objectAt("$.comprehend.Payload.keyPhrases"), // Changed from stringAt to objectAt to preserve array structure
        summary: sfn.JsonPath.stringAt("$.bedrock.Payload.summary"),
        insights: sfn.JsonPath.stringAt("$.bedrock.Payload.insights"),
        structuredData: sfn.JsonPath.stringAt("$.bedrock.Payload.structuredData"),
        status: "PROCESSED",
        contentHash: sfn.JsonPath.stringAt("$.duplicateCheck.Payload.hash"),
      }),
      resultPath: sfn.JsonPath.DISCARD,
    });

    const processingSucceeded = new sfn.Succeed(this, "ProcessingSucceeded");

    const processingChain = comprehendTask
      .next(bedrockTask)
      .next(storeMetadataTask)
      .next(processingSucceeded);

    const textractFailed = new sfn.Fail(this, "TextractFailed", {
      cause: "Textract job failed",
      error: "TextractFailure",
    });

    const textractStatusChoice = new sfn.Choice(this, "TextractStatusChoice")
      .when(
        sfn.Condition.stringEquals("$.textractStatus.Payload.status", "SUCCEEDED"),
        processingChain
      )
      .when(
        sfn.Condition.stringEquals("$.textractStatus.Payload.status", "FAILED"),
        textractFailed
      )
      .otherwise(waitForTextract);

    const storeDuplicateTask = new tasks.LambdaInvoke(this, "StoreDuplicateMetadata", {
      lambdaFunction: storeMetadataLambda,
      payload: sfn.TaskInput.fromObject({
        bucket: sfn.JsonPath.stringAt("$.bucket"),
        key: sfn.JsonPath.stringAt("$.key"),
        text: "",
        language: "unknown",
        entities: [],
        keyPhrases: [],
        summary: sfn.JsonPath.stringAt("$.duplicateCheck.Payload.message"),
        insights: sfn.JsonPath.stringAt("$.duplicateCheck.Payload.insights"),
        structuredData: "{}",
        status: "DUPLICATE",
        duplicateOf: sfn.JsonPath.stringAt("$.duplicateCheck.Payload.originalDocumentId"),
        contentHash: sfn.JsonPath.stringAt("$.duplicateCheck.Payload.hash"),
      }),
      resultPath: sfn.JsonPath.DISCARD,
    });

    const duplicateBranch = storeDuplicateTask.next(processingSucceeded);

    const textractFlow = startTextractTask
      .next(waitForTextract)
      .next(getTextractStatus)
      .next(textractStatusChoice);

    const duplicateChoice = new sfn.Choice(this, "IsDuplicateDocument")
      .when(
        sfn.Condition.booleanEquals("$.duplicateCheck.Payload.isDuplicate", true),
        duplicateBranch
      )
      .otherwise(textractFlow);

    const definition = prepareInput.next(checkDuplicateTask).next(duplicateChoice);

    const stateMachineLogGroup = new logs.LogGroup(this, "DocumentProcessingLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const documentStateMachine = new sfn.StateMachine(this, "DocumentProcessingStateMachine", {
      stateMachineName: `doc-processing-${this.region}-${uuid.v4().substring(0, 8)}`,
      definition,
      timeout: Duration.minutes(30),
      logs: {
        destination: stateMachineLogGroup,
        level: sfn.LogLevel.ALL,
      },
      tracingEnabled: true,
    });

    /** EventBridge Rule - Trigger Step Function on S3 Upload */
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
      new targets.SfnStateMachine(documentStateMachine, {
        retryAttempts: 2,
        maxEventAge: Duration.hours(1),
      })
    );

    /** Lambda Function - Search API Handler */
    const searchLambda = new NodejsFunction(this, "SearchHandler", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/search-handler.js"),
      functionName: `doc-search-${this.region}-${uuid.v4().substring(0, 8)}`,
      timeout: Duration.seconds(30),
      environment: {
        METADATA_TABLE_NAME: metadataTableName,
        DOCUMENT_NAME_TABLE: documentNameTableName,
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
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${documentNameTableName}`,
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${documentNameTableName}/index/*`,
          // DR region access (if Lambda needs to access DR region directly)
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${metadataTableName}`,
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${metadataTableName}/index/*`,
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${documentNameTableName}`,
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${documentNameTableName}/index/*`,
        ],
      })
    );
    
    encryptionKey.grantDecrypt(searchLambda);

    /** API Gateway */
    // Initialize API Gateway without CloudFront origin (will be added after distribution creation)
    const api = new apigw.RestApi(this, "DocumentProcessorAPI", {
      restApiName: `doc-processor-api-${this.region}-${uuid.v4().substring(0, 8)}`,
      defaultCorsPreflightOptions: {
        // CORS configuration - CloudFront origin will be added after distribution is created
        // Using ALL_ORIGINS temporarily, will be scoped after CloudFront deployment
        allowOrigins: apigw.Cors.ALL_ORIGINS, // Will be updated to specific origins after CloudFront creation
        allowHeaders: ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key"],
        allowMethods: apigw.Cors.ALL_METHODS,
        allowCredentials: true, // Required for Cognito authentication
      },
      // Note: Resource policy explicitly set to undefined to remove any existing policy
      // This allows CORS preflight (OPTIONS) requests to work
      // Individual methods still require authentication (IAM or Cognito)
      // If you need to restrict by account, do it per-method or use a custom authorizer
      policy: undefined, // Explicitly remove any existing resource policy
      deployOptions: {
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        dataTraceEnabled: false,
      },
    });

    const apiIntegration = new apigw.LambdaIntegration(searchLambda);

    /** Cognito User Pool for Frontend Authentication */
    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `doc-processor-users-${this.region}-${uuid.v4().substring(0, 8)}`,
      signInAliases: {
        email: true,
        username: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      autoVerify: {
        email: true,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Cognito Domain (required for OAuth hosted UI)
    // Note: Domain must be globally unique and stable across deployments
    // Using a deterministic name based on stack name to avoid recreation
    const domainPrefix = `doc-proc-${uuid.v4().substring(0, 8)}`.substring(0, 13); // 13 chars max - use UUID for uniqueness
    const cognitoDomain = userPool.addDomain("CognitoDomain", {
      cognitoDomain: {
        domainPrefix: domainPrefix,
      },
    });

    // User Pool Client for frontend
    const userPoolClient = userPool.addClient("FrontendClient", {
      userPoolClientName: `doc-processor-frontend-${this.region}-${uuid.v4().substring(0, 8)}`,
      generateSecret: false, // Required for frontend clients
      // Enable auth flows that support self-signup and password authentication
      authFlows: {
        userPassword: true, // Allows users to sign up and sign in with username/password
        userSrp: true, // Secure Remote Password protocol (recommended for web apps)
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        // Callback URLs will be updated after CloudFront deployment
        // Can be configured manually in Cognito console or via CLI
        callbackUrls: [
          "http://localhost:3000", // For local development
        ],
        logoutUrls: [
          "http://localhost:3000",
        ],
      },
      preventUserExistenceErrors: true,
    });

    // Create test user account automatically during deployment
    const createTestUserLambda = new NodejsFunction(this, "CreateTestUser", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/create-test-user.js"),
      functionName: `create-test-user-${this.region}-${uuid.v4().substring(0, 8)}`,
      timeout: Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Grant permissions to create users in the User Pool
    createTestUserLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminGetUser",
        ],
        resources: [userPool.userPoolArn],
      })
    );

    // Custom Resource to create test user after User Pool is created
    const testUserProvider = new cr.Provider(this, "TestUserProvider", {
      onEventHandler: createTestUserLambda,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const testUserResource = new CustomResource(this, "TestUserResource", {
      serviceToken: testUserProvider.serviceToken,
      properties: {
        UserPoolId: userPool.userPoolId,
        TestUserEmail: "test@example.com",
        TestUserPassword: "TestPassword123!",
        TestUsername: "testuser", // Username must differ from email when email is used as sign-in alias
      },
      removalPolicy: RemovalPolicy.RETAIN, // Keep test user even if stack is deleted
    });
    testUserResource.node.addDependency(userPool);

    // Cognito Authorizer for API Gateway
    const cognitoAuthorizer = new apigw.CognitoUserPoolsAuthorizer(this, "CognitoAuthorizer", {
      cognitoUserPools: [userPool],
      authorizerName: `cognito-authorizer-${this.region}-${uuid.v4().substring(0, 8)}`,
    });

    // Search endpoint - Use Cognito auth for frontend
    const searchResource = api.root.addResource("search");
    searchResource.addMethod("GET", apiIntegration, {
      authorizer: cognitoAuthorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });
    searchResource.addMethod("POST", apiIntegration, {
      authorizer: cognitoAuthorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });

    // Metadata endpoint - Use Cognito auth for frontend
    // Use query parameter instead of path parameter to support documentId with slashes
    const metadataResource = api.root.addResource("metadata");
    metadataResource.addMethod("GET", apiIntegration, {
      authorizer: cognitoAuthorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });

    // Health endpoint (IAM authentication required - complies with SCP)
    api.root.addResource("health").addMethod("GET", apiIntegration, {
      authorizationType: apigw.AuthorizationType.IAM,
    });

    /** Lambda Function - Upload Handler (Presigned URLs) */
    const uploadLambda = new NodejsFunction(this, "UploadHandler", {
      runtime: Runtime.NODEJS_20_X,
      entry: join(__dirname, "../lambda/upload-handler.js"),
      functionName: `doc-upload-${this.region}-${uuid.v4().substring(0, 8)}`,
      timeout: Duration.seconds(30),
      environment: {
        DOCUMENTS_BUCKET: docsBucket.bucketName,
        KMS_KEY_ARN: encryptionKey.keyArn, // Pass KMS key ARN for presigned URL encryption
        DOCUMENT_NAME_TABLE: documentNameTableName,
      },
      logRetention: logs.RetentionDays.THREE_MONTHS,
      deadLetterQueue: lambdaDLQ,
    });

    // Grant S3 put permissions for presigned URLs
    docsBucket.grantPut(uploadLambda);
    encryptionKey.grantEncryptDecrypt(uploadLambda);
    
    // Grant DynamoDB write permissions for document name mapping
    uploadLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:PutItem"],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/${documentNameTableName}`,
          `arn:aws:dynamodb:${drRegion}:${this.account}:table/${documentNameTableName}`,
        ],
      })
    );

    const uploadIntegration = new apigw.LambdaIntegration(uploadLambda);

    // Upload endpoint with Cognito authentication
    // Note: OPTIONS method is automatically created by defaultCorsPreflightOptions
    const uploadResource = api.root.addResource("upload");
    uploadResource.addMethod("POST", uploadIntegration, {
      authorizer: cognitoAuthorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });

    // Note: Search and metadata endpoints already support IAM auth
    // Cognito auth can be added later if needed by creating additional methods
    // For now, keeping IAM auth for API access, Cognito for upload endpoint

    /** S3 Bucket for Frontend Hosting */
    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `doc-processor-frontend-${uuid.v4().substring(0, 8)}`,
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: encryptionKey,
      enforceSSL: true,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html", // For React Router
    });

    // CloudFront Distribution for Frontend
    // Use S3BucketOrigin.withOriginAccessControl() which automatically creates OAC
    const frontendDistribution = new cloudfront.Distribution(this, "FrontendDist", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html", // SPA routing
          ttl: Duration.minutes(0),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe
      comment: "Frontend distribution for document processor visualization suite",
    });

    // Grant CloudFront OAC access to S3 bucket
    // Allow CloudFront service principal to access objects
    frontendBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowCloudFrontOAC",
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["s3:GetObject"],
        resources: [`${frontendBucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/${frontendDistribution.distributionId}`,
          },
        },
      })
    );

    // Update API Gateway CORS to allow CloudFront origin
    const cloudfrontOrigin = `https://${frontendDistribution.distributionDomainName}`;
    
    // Add CloudFront origin to CORS allowed origins
    // This requires updating the API Gateway CORS configuration
    // We'll do this by adding it to each method that needs CORS
    
    api.addGatewayResponse("CorsResponse", {
      type: apigw.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": `'${cloudfrontOrigin}'`,
        "Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
        "Access-Control-Allow-Credentials": "'true'",
      },
    });

    api.addGatewayResponse("Cors5XXResponse", {
      type: apigw.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": `'${cloudfrontOrigin}'`,
        "Access-Control-Allow-Headers": "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
        "Access-Control-Allow-Credentials": "'true'",
      },
    });
    
    // Note: The defaultCorsPreflightOptions only allows localhost:3000
    // We need to also add CloudFront origin manually via AWS CLI or console after deployment
    // OR we can use a Lambda authorizer that adds CORS headers dynamically

    // Deploy the React app to S3 bucket (automatic build and deployment)
    // This matches the pattern used in the chatbot project
    // The frontend will be built during CDK deployment and automatically deployed
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
        // Deploy runtime config with stack outputs (frontend reads this at runtime)
        // This allows frontend to get stack outputs without rebuild
        s3deploy.Source.jsonData("config.json", {
          userPoolId: userPool.userPoolId,
          userPoolClientId: userPoolClient.userPoolClientId,
          cognitoDomain: cognitoDomain.domainName,
          apiEndpoint: api.url,
          region: this.region,
          cloudfrontUrl: cloudfrontOrigin,
          redirectUrl: cloudfrontOrigin, // Production redirect URL
        }),
      ],
      destinationBucket: frontendBucket,
      distribution: frontendDistribution,
      distributionPaths: ["/*"], // Automatically invalidate CloudFront cache on deploy
      // Prune old files to keep bucket clean
      prune: true,
    });

    /** CloudWatch Monitoring */
    const alertTopic = new sns.Topic(this, "AlertTopic", {
      displayName: "Document Processing Alerts",
      topicName: `doc-processing-alerts-${this.region}-${uuid.v4().substring(0, 8)}`,
    });

    // DLQ Alarm
    const dlqAlarm = new cloudwatch.Alarm(this, "DLQMessagesAlarm", {
      metric: lambdaDLQ.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Alert when Lambda functions fail and messages go to DLQ",
      alarmName: `lambda-dlq-messages-${this.region}-${uuid.v4().substring(0, 8)}`,
    });
    dlqAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));

    // Workflow Failure Alarm
    const workflowFailureAlarm = new cloudwatch.Alarm(this, "WorkflowFailureAlarm", {
      metric: documentStateMachine.metricFailed({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      alarmDescription: "Alert when document processing workflow fails",
      alarmName: `doc-processing-failures-${this.region}-${uuid.v4().substring(0, 8)}`,
    });
    workflowFailureAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));

    const dashboard = new cloudwatch.Dashboard(this, "ProcessorDashboard", {
      dashboardName: `doc-processor-metrics-${this.region}-${uuid.v4().substring(0, 8)}`,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Document Processing",
        left: [
          documentStateMachine.metricSucceeded().with({ label: "Succeeded" }),
          documentStateMachine.metricFailed().with({ label: "Failed", color: "#D13212" }),
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
    new CfnOutput(this, "HashRegistryTableName", {
      value: hashTableName,
      description: "DynamoDB Global Table used for duplicate detection",
    });
    new CfnOutput(this, "PrimaryRegion", { value: primaryRegion });
    new CfnOutput(this, "DRRegion", { value: drRegion });
    new CfnOutput(this, "GlobalTableArn", {
      value: globalTable.attrArn || "",
      description: "DynamoDB Global Table ARN",
    });
    
    // Frontend outputs
    new CfnOutput(this, "FrontendBucketName", {
      value: frontendBucket.bucketName,
      description: "S3 bucket for frontend hosting",
    });
    new CfnOutput(this, "CloudFrontDistributionId", {
      value: frontendDistribution.distributionId,
      description: "CloudFront distribution ID",
    });
    new CfnOutput(this, "CloudFrontDomainName", {
      value: frontendDistribution.distributionDomainName,
      description: "CloudFront distribution domain name",
    });
    new CfnOutput(this, "CloudFrontURL", {
      value: `https://${frontendDistribution.distributionDomainName}`,
      description: "CloudFront URL for frontend access",
    });
    new CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
    });
    new CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
      description: "Cognito User Pool Client ID (for frontend)",
    });
    new CfnOutput(this, "CognitoDomain", {
      value: cognitoDomain.domainName,
      description: "Cognito domain name (for OAuth hosted UI)",
    });
    new CfnOutput(this, "TestUserEmail", {
      value: "test@example.com",
      description: "Test user email address",
    });
    new CfnOutput(this, "TestUserPassword", {
      value: "TestPassword123!",
      description: "Test user password",
    });
    new CfnOutput(this, "CognitoDomainPrefix", {
      value: cognitoDomain.domainName.split(".")[0],
      description: "Cognito domain prefix (for frontend configuration)",
    });
  }
}


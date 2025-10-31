# Simplified Architecture - AWS Workshop Pattern

## Based on AWS Intelligent Document Processing Workshop

Reference: https://catalog.workshops.aws/intelligent-document-processing/en-US

## Simple Pattern (What You Should Use)

```
S3 Upload → EventBridge → Lambda Function
                           ↓
                    - Call Textract API
                    - Call Comprehend API (language, entities, phrases)
                    - Store results in DynamoDB
                    - Optional: Send SNS notification
```

## Components Needed

### 1. Storage
- **S3 Bucket**: Store original documents
- **DynamoDB Table**: Store extracted metadata (keywords, entities, language, etc.)

### 2. Processing
- **EventBridge Rule**: Trigger on S3 object creation
- **Lambda Function**: Orchestrates Textract + Comprehend

### 3. API (Optional)
- **API Gateway**: REST API for searching
- **Lambda Function**: Query DynamoDB

### 4. Monitoring (Optional)
- **CloudWatch Logs**: Lambda execution logs
- **SNS Topic**: Error notifications

## That's It - No Need For:

❌ **Bedrock Flows** - Overkill for this use case  
❌ **OpenSearch** - DynamoDB is sufficient for metadata queries  
❌ **VPC** - Not needed (unless SCP specifically requires it for Lambda/DynamoDB)  
❌ **Bedrock Agents** - Not needed for batch processing  
❌ **Complex Orchestration** - Lambda is sufficient  

## Simplified Stack (CDK)

```typescript
// 1. S3 Bucket
const docsBucket = new s3.Bucket(this, "DocumentsBucket", {
  // Basic config - versioning, encryption, lifecycle
});

// 2. DynamoDB Table
const metadataTable = new dynamodb.Table(this, "MetadataTable", {
  partitionKey: { name: "documentId", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "processingDate", type: dynamodb.AttributeType.STRING },
  // GSI for language queries if needed
});

// 3. Lambda Function (Document Processor)
const processorLambda = new NodejsFunction(this, "DocumentProcessor", {
  entry: "lambda/document-processor.js",
  environment: {
    METADATA_TABLE_NAME: metadataTable.tableName,
  },
});

// Grant permissions
docsBucket.grantRead(processorLambda);
metadataTable.grantWriteData(processorLambda);
processorLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["textract:*", "comprehend:*"],
    resources: ["*"],
  })
);

// 4. EventBridge Rule
const rule = new events.Rule(this, "DocumentProcessingRule", {
  eventPattern: {
    source: ["aws.s3"],
    detailType: ["Object Created"],
    detail: { bucket: { name: [docsBucket.bucketName] } },
  },
});
rule.addTarget(new targets.LambdaFunction(processorLambda));

// 5. API Gateway (Optional - for search)
const api = new apigw.RestApi(this, "SearchAPI");
const searchLambda = new NodejsFunction(this, "SearchHandler", {
  entry: "lambda/search-handler.js",
  environment: { METADATA_TABLE_NAME: metadataTable.tableName },
});
metadataTable.grantReadData(searchLambda);
api.root.addResource("search").addMethod("GET", 
  new apigw.LambdaIntegration(searchLambda)
);
```

## Lambda Function (document-processor.js)

```javascript
const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const { ComprehendClient, DetectDominantLanguageCommand, DetectEntitiesCommand, ExtractKeyPhrasesCommand } = require("@aws-sdk/client-comprehend");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

exports.handler = async (event) => {
  const textract = new TextractClient();
  const comprehend = new ComprehendClient();
  const dynamodb = new DynamoDBClient();
  
  // Parse S3 event
  const bucket = event.detail.bucket.name;
  const key = decodeURIComponent(event.detail.object.key);
  
  // 1. Extract text with Textract
  const textractResponse = await textract.send(
    new DetectDocumentTextCommand({ Document: { S3Object: { Bucket: bucket, Name: key } } })
  );
  const text = textractResponse.Blocks.map(b => b.Text).join("\n");
  
  // 2. Detect language
  const langResponse = await comprehend.send(
    new DetectDominantLanguageCommand({ Text: text })
  );
  const language = langResponse.Languages[0].LanguageCode;
  
  // 3. Extract entities
  const entitiesResponse = await comprehend.send(
    new DetectEntitiesCommand({ Text: text, LanguageCode: language })
  );
  
  // 4. Extract key phrases
  const phrasesResponse = await comprehend.send(
    new ExtractKeyPhrasesCommand({ Text: text, LanguageCode: language })
  );
  
  // 5. Store in DynamoDB
  await dynamodb.send(
    new PutItemCommand({
      TableName: process.env.METADATA_TABLE_NAME,
      Item: {
        documentId: { S: `${bucket}/${key}` },
        processingDate: { S: new Date().toISOString() },
        language: { S: language },
        entities: { S: JSON.stringify(entitiesResponse.Entities) },
        keyPhrases: { S: JSON.stringify(phrasesResponse.KeyPhrases) },
        text: { S: text.substring(0, 10000) }, // First 10k chars
      },
    })
  );
  
  return { statusCode: 200 };
};
```

## Search Lambda (search-handler.js)

```javascript
const { DynamoDBClient, QueryCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");

exports.handler = async (event) => {
  const dynamodb = new DynamoDBClient();
  const { language, entityType, q } = event.queryStringParameters || {};
  
  // Simple query - can be enhanced
  if (language) {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: process.env.METADATA_TABLE_NAME,
        IndexName: "LanguageIndex",
        KeyConditionExpression: "language = :lang",
        ExpressionAttributeValues: { ":lang": { S: language } },
      })
    );
    return { statusCode: 200, body: JSON.stringify(result.Items) };
  }
  
  // Scan for simple search (or use DynamoDB Query with GSI)
  const result = await dynamodb.send(
    new ScanCommand({ TableName: process.env.METADATA_TABLE_NAME })
  );
  return { statusCode: 200, body: JSON.stringify(result.Items) };
};
```

## Benefits of Simplified Approach

✅ **Much Simpler** - ~200 lines of CDK vs ~400+ lines  
✅ **Faster to Deploy** - No VPC, no OpenSearch provisioning  
✅ **Lower Cost** - No OpenSearch, no NAT Gateway, no VPC endpoints  
✅ **Easier to Debug** - One Lambda function, clear flow  
✅ **Follows AWS Workshop Pattern** - Standard approach  
✅ **Actually Deployable** - No complex dependencies  

## When to Add Complexity Back

Only add if you actually need:

- **OpenSearch**: Only if you need full-text search of document content (not just metadata)
- **Bedrock Flows**: Only if you need complex workflow logic with conditional branching
- **VPC**: Only if SCP explicitly requires it (but you could still use DynamoDB without VPC)
- **Multi-Region DR**: Only if you actually deploy to multiple regions (you haven't)

## Recommendation

**Simplify to this pattern now.** Remove:
- Bedrock Flows
- OpenSearch (or keep if you truly need full-text search)
- VPC (or keep minimal if SCP requires)
- Complex orchestration

Keep:
- S3 + DynamoDB
- Lambda + Textract + Comprehend
- EventBridge trigger
- Optional: API Gateway for search


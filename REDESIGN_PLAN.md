# Redesign Plan - Following AWS Bedrock Flows Samples

## Reference
- AWS Samples: https://github.com/aws-samples/amazon-bedrock-flows-samples
- Flow invocation: Direct via `bedrock-runtime:InvokeFlow` API

## Correct Architecture

### Flow Invocation Pattern
```
S3 Upload → S3 Event → EventBridge Rule → Bedrock Flow (direct invocation)
                                         ↓
                                   Flow executes nodes:
                                   - Prompt nodes (Claude for processing)
                                   - Lambda tool nodes (if needed)
                                   - Conditional logic
                                   - Output
```

### Minimal Lambda Functions Needed

1. **Infrastructure (1-2)**
   - `flow-creator.js` - Custom resource to create Flow from JSON (REQUIRED for CDK)
   - Optional: Tool registrar if Lambda tools needed

2. **Tool Lambdas (only if Flow needs them)**
   - `textract-tool.js` - If Flow needs Textract (could use direct API)
   - `dynamodb-writer-tool.js` - If Flow needs to write to DynamoDB
   - `opensearch-indexer-tool.js` - If Flow needs to index

3. **API Handler (1)**
   - `api-handler.js` - For search/metadata endpoints (DynamoDB/OpenSearch queries)

**Total: 3-6 Lambdas** (vs current 8+)

## Key Changes

1. **Remove Agent creation** - Not needed for batch document processing
2. **Remove document-processor Lambda** - EventBridge invokes Flow directly  
3. **Fix Flow definition** - Use correct node types per AWS samples
4. **Direct Flow invocation** - Via EventBridge rule or API Gateway

## Next Steps

1. Clean up existing incorrect code
2. Create proper Flow JSON definition
3. Set up EventBridge → Flow direct invocation
4. Create only necessary Lambda tools
5. Test with AWS samples pattern


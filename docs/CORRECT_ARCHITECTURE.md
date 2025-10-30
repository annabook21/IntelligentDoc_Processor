# Correct Bedrock Flows Architecture

Based on [AWS Bedrock Flows Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started-mortgage-flow.html), the correct pattern is:

## ✅ Correct Pattern

```
S3 Event → EventBridge → Bedrock Flow (direct invocation)
                          ↓
                    Flow Orchestrates:
                    - Lambda Tools (Textract wrapper, Comprehend wrapper, DynamoDB writer, OpenSearch indexer)
                    - Direct API calls to Textract/Comprehend
                    - Conditional logic
                    - Output
```

## ❌ Incorrect Pattern (What I Had)

```
S3 Event → SQS → Lambda → Bedrock Agent → Bedrock Flow
```

This is wrong because:
- Flows should be invoked directly, not through Agents
- Lambda should be tools WITHIN the Flow, not wrappers around it
- Agents are optional nodes within Flows, not required orchestrators

## Correct Architecture

### Flow Invocation
- **Direct**: EventBridge → Bedrock Flow Runtime API (`bedrock-runtime:InvokeFlow`)
- **Or**: API Gateway → Bedrock Flow Runtime API
- **Not**: Lambda → Agent → Flow

### Lambda Functions as Tools
Lambda functions become **tools/actions** registered with the Flow:
1. `textract-extractor-tool.js` - Wraps Textract API calls
2. `comprehend-processor-tool.js` - Wraps Comprehend API calls
3. `dynamodb-writer-tool.js` - Writes to DynamoDB
4. `opensearch-indexer-tool.js` - Indexes to OpenSearch

These are **tools** used BY the Flow, not functions that invoke the Flow.

### Flow Structure

```json
{
  "nodes": [
    {"type": "Input", "name": "FlowInput"},
    {"type": "ToolUse", "name": "TextractExtractor", "tool": "textract-extractor-tool"},
    {"type": "ToolUse", "name": "LanguageDetector", "tool": "comprehend-processor-tool"},
    {"type": "Prompt", "name": "Summarizer", "modelId": "claude-3-sonnet"},
    {"type": "ToolUse", "name": "StoreMetadata", "tool": "dynamodb-writer-tool"},
    {"type": "ToolUse", "name": "IndexContent", "tool": "opensearch-indexer-tool"},
    {"type": "Output", "name": "FlowOutput"}
  ]
}
```

## Lambda Function Count

### Infrastructure (2) - Required for CDK
- `flow-creator.js` - Custom resource
- `tool-registrar.js` - Registers Lambda tools with Flow

### Tools (4) - Used BY the Flow
- `textract-extractor-tool.js`
- `comprehend-processor-tool.js`
- `dynamodb-writer-tool.js`
- `opensearch-indexer-tool.js`

### Runtime Invocation (0-1)
- Optional: `eventbridge-to-flow-bridge.js` - Only if EventBridge can't invoke Flow directly
- Or: Use API Gateway direct integration

**Total: 6-7 Lambdas** (but 4 are tools used BY the Flow, not to invoke it)


# Lambda Function Analysis & Optimization

## Current State: 6 Lambda Functions

### 1. Infrastructure-Only (2) - **REQUIRED for CDK**
- `flow-creator.js` - Creates Bedrock Flow (runs once during deployment)
- `agent-creator.js` - Creates Bedrock Agent (runs once during deployment)
- **Status**: ✅ Cannot eliminate - CDK doesn't support Bedrock Flows/Agents natively

### 2. Runtime Processing (4) - **CAN BE REDUCED**
- `document-processor.js` - SQS → Bedrock Agent bridge
- `search-handler.js` - Search API endpoint
- `metadata-handler.js` - Metadata API endpoint  
- `health-handler.js` - Health check endpoint
- **Status**: ❌ Can be optimized to 1-2 functions

## Optimization Plan

### Reduce Runtime Lambdas from 4 → 2

1. **Consolidate API Handlers** (3 → 1)
   - Merge `search-handler.js`, `metadata-handler.js`, and `health-handler.js` into single `api-handler.js`
   - Route based on API Gateway path

2. **Simplify Document Processor** (1 → 1, but simpler)
   - Keep minimal bridge from EventBridge/S3 → Bedrock Agent
   - Remove SQS if EventBridge can handle it

## Optimized State: 4 Lambda Functions Total

### Infrastructure (2) - Unchanged
- `flow-creator.js` 
- `agent-creator.js`

### Runtime (2) - Reduced
- `minimal-processor.js` - EventBridge → Bedrock Agent bridge
- `api-handler.js` - All API endpoints consolidated

**Result**: 4 total Lambdas (down from 6) = **33% reduction**

## Why Keep These?

1. **Custom Resource Lambdas** - Required by CDK infrastructure
2. **Minimal Processor** - Bedrock Agents need specific invocation format, thin wrapper needed
3. **API Handler** - Bedrock Agent can't query DynamoDB/OpenSearch directly without tools, so Lambda needed

## Alternative: Even More Minimal (3 Lambdas)

If Bedrock Flow can use tools to query DynamoDB/OpenSearch:
- Remove API handler Lambda
- API Gateway → Bedrock Agent directly
- Agent/Flow uses tools to query databases

**Result**: 3 total Lambdas = **50% reduction from original**


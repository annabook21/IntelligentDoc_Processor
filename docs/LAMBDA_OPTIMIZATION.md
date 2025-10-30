# Lambda Function Optimization

## Current Lambda Functions (6 total)

### Infrastructure-Only (2) - **CANNOT BE ELIMINATED**
These run only during CDK deployment to create/manage Bedrock resources:
1. **flow-creator.js** - Creates Bedrock Flow via Custom Resource
2. **agent-creator.js** - Creates Bedrock Agent via Custom Resource

**Reason**: CDK doesn't have native Bedrock Flows/Agents support yet, so custom resources are needed.

### Runtime Processing (4) - **CAN BE OPTIMIZED**

3. **document-processor.js** - SQS → Bedrock Agent bridge
   - **Current**: S3 Event → SQS → Lambda → Bedrock Agent
   - **Optimized**: S3 Event → EventBridge → Bedrock Agent (or minimal bridge)

4. **search-handler.js** - Search API handler
   - Queries DynamoDB + OpenSearch
   - **Could keep**: Needed for database queries

5. **metadata-handler.js** - Metadata API handler  
   - Queries DynamoDB
   - **Could consolidate**: Merge with search-handler

6. **health-handler.js** - Health check
   - **Could eliminate**: Simple endpoint, could be part of metadata-handler

## Optimized Architecture (3-4 Lambda Functions)

### Option 1: Minimal Lambdas (3 runtime + 2 infrastructure = 5 total)

**Runtime:**
1. **thin-processor.js** - Minimal EventBridge → Bedrock Agent bridge (if EventBridge can't invoke Agent directly)
2. **api-handler.js** - Consolidated API handler (search + metadata + health)
3. *(Optional)* **custom tools Lambda** - If Bedrock Flow needs DynamoDB/OpenSearch tools

**Infrastructure:**
4. **flow-creator.js** - Custom resource (kept)
5. **agent-creator.js** - Custom resource (kept)

### Option 2: EventBridge Direct (2 runtime + 2 infrastructure = 4 total)

If EventBridge can invoke Bedrock Agent directly:
1. **api-handler.js** - All API endpoints consolidated
2. *(Optional)* **tools Lambda** - For Bedrock Flow to call DynamoDB/OpenSearch
3. **flow-creator.js** - Custom resource
4. **agent-creator.js** - Custom resource

## Recommendation

**Use Option 1**: 
- Replace SQS → Lambda → Agent with EventBridge → minimal Lambda → Agent
- Consolidate 3 API handlers into 1
- Keep custom resource Lambdas (infrastructure-only)

**Result**: 3 runtime Lambdas + 2 infrastructure Lambdas = **5 total** Btu
Down from 6 runtime + 2 infrastructure = **8 total**

**Reduction**: 3 fewer runtime Lambda functions


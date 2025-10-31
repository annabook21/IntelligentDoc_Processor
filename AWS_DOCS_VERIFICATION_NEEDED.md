# AWS Documentation Verification Needed

## Questions Requiring AWS Documentation Answers

### 1. Bedrock InvokeFlowCommand Parameter Name
**File**: `backend/flows/flow-invoker.js` line 44
**Current Code**:
```javascript
const invokeCommand = new InvokeFlowCommand({
  flowId: process.env.FLOW_ID,
  flowInput: JSON.stringify(flowInput),
  contentType: "application/json",
  accept: "application/json",
});
```

**Question**: Is the parameter `flowId` or `flowIdentifier`?
**AWS Documentation to Check**: 
- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeFlow.html
- AWS SDK v3 documentation for `@aws-sdk/client-bedrock-runtime`

**Action**: Verify correct parameter name in latest SDK

---

### 2. EventBridge S3 Object Created Event Pattern
**File**: `backend/lib/intelligent-doc-processor-stack.ts` lines 198-205
**Current Code**:
```typescript
const processingRule = new events.Rule(this, "DocumentProcessingRule", {
  eventPattern: {
    source: ["aws.s3"],
    detailType: ["Object Created"],
    detail: {
      bucket: { name: [docsBucket.bucket akName] },
    },
  },
});
```

**Question**: Is this the correct event pattern structure for S3 → EventBridge?
**AWS Documentation to Check**:
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventBridge.html
- EventBridge event pattern for S3 notifications

**Note**: S3 may need EventBridge notifications enabled on bucket
**Action**: Verify event pattern structure and S3 configuration

---

### 3. Bedrock Flow JSON Definition Structure
**File**: `backend/flows/document-processing-flow.jsonCorrections`
**Current Structure**: Uses `FlowDefinition` wrapper with `Nodes` and `Connections`

**Question**: Does Bedrock CreateFlowCommand accept this structure directly?
**AWS Documentation to Check**:
- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_CreateFlow.html
- Bedrock Flows JSON schema
- AWS Bedrock Flows samples: https://github.com/aws-samples/amazon-bedrock-flows-samples

**Note**: Flow definition may need to be in `definition` parameter, not `FlowDefinition`
**Action**: Compare against official examples

---

### 4. OpenSearch Client Authentication
**File**: `backend/flows/api-handler.js` lines 60-64
**Current Code**:
```javascript
const opensearchClient = new Client({
  node: `https://${opensearchEndpoint}`,
  auth: { credentials: defaultProvider() },
  ssl: { rejectUnauthorized: false },
});
```

**Question**: 
- Is `defaultProvider()` the correct way to get AWS credentials?
- Should `rejectUnauthorized: false` be used in production?

**AWS Documentation to Check**:
- OpenSearch JavaScript client documentation
- AWS credential providers for OpenSearch

**Action**: Verify authentication approach for OpenSearch Service

---

### 5. Flow Creator Lambda - Flow Definition Loading
**File**: `backend/flows/flow-creator.js` lines 31-34
**Current Code**: Tries to read JSON file from `__dirname`

**Question**: Will the JSON file be bundled with Lambda?
**Issue**: NodejsFunction may not include JSON files by default
**Action**: Verify bundling behavior or use inline definition

---

## Verification Checklist

- [ ] Bedrock InvokeFlowCommand parameter name verified
- [ ] EventBridge S3 event pattern verified
- [ ] Bedrock Flow JSON structure verified
- [ ] OpenSearch authentication method verified
- [ ] Lambda bundling includes JSON files verified

## Recommended Next Steps

1. **Check AWS SDK Documentation**:
   - https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/
   - Verify all SDK calls match latest API

2. **Review AWS Samples**:
   - https://github.com/aws-samples/amazon-bedrock-flows-samples
   - Compare Flow definitions and invocation patterns

3. **Test in AWS Console**:
   - Create Flow manually to verify JSON structure
   - Test EventBridge rule to verify event pattern
   - Test Lambda functions with sample events


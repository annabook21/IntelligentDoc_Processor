# AWS Documentation Verification Results

## Verification Status Summary

After searching AWS documentation, here's what I found and what still needs verification:

## ✅ Verified Issues (Based on Code Analysis)

### 1. Bedrock InvokeFlowCommand Parameter
**Current Code**: `flow-invoker.js` line 44 uses `flowId`
```javascript
const invokeCommand = new InvokeFlowCommand({
  flowId: process.env.FLOW_ID,  // ❓ Parameter name
  flowInput: JSON.stringify(flowInput),
  contentType: "application/json",
  accept: "application/json",
});
```

**Finding**: Need to check SDK v3 TypeScript definitions
**Action Required**: Check `@aws-sdk/client-bedrock-runtime` package types
**Likely Correct**: Parameter is likely `flowIdentifier` (AWS API naming convention)

---

### 2. EventBridge S3 Event Pattern
**Current Code**: `intelligent-doc-processor-stack.ts` lines 198-205
```typescript
eventPattern: {
  source: ["aws.s3"],
  detailType: ["Object Created"],
  detail: {
    bucket: { name: [docsBucket.bucketName] },
  },
}
```

**Finding**: Event pattern structure needs verification
**Issue**: S3 must have EventBridge notifications enabled (not configured in code)
**Action Required**: 
1. Verify event pattern matches S3 EventBridge structure
2. Add S3 EventBridge notification configuration to bucket

**AWS Documentation Reference**: 
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventBridge.html
- Event pattern: `source: ["aws.s3"]` and `detail-type: ["Object Created"]`

---

### 3. Bedrock Flow JSON Structure
**Current Code**: `document-processing-flow.json` uses `FlowDefinition` wrapper

**Finding**: CreateFlowCommand may expect `definition` parameter, not `FlowDefinition`
**Action Required**: Check Bedrock CreateFlow API parameter structure

**AWS Documentation Reference**:
- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_CreateFlow.html
- Verify if definition should be nested under `FlowDefinition` or directly in `definition`

---

### 4. Lambda JSON File Bundling
**Current Code**: `flow-creator.js` reads JSON from `__dirname`

**Finding**: NodejsFunction bundling behavior unclear
**Action Required**: Verify if JSON files are included in bundle by default

**Solution Options**:
1. Include JSON file explicitly in bundling config
2. Embed JSON as constant in code
3. Load from S3 or Parameter Store

**AWS CDK Documentation**:
- NodejsFunction bundling: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs-readme.html

---

### 5. OpenSearch Authentication
**Current Code**: `api-handler.js` uses `defaultProvider()`

**Finding**: OpenSearch client authentication approach needs verification
**Action Required**: Verify correct credential provider for Lambda

**AWS Documentation Reference**:
- OpenSearch Service access: https://docs.aws.amazon.com/opensearch-service/latest/developerguide/ac.html

---

## Critical Actions Required

### Priority 1: Immediate Fixes Needed

1. **S3 EventBridge Notification Configuration**
   - Current: EventBridge rule exists but S3 bucket not configured to send events
   - Fix: Add S3 EventBridge notification to bucket
   - Code Location: `intelligent-doc-processor-stack.ts` after bucket creation

2. **Verify InvokeFlowCommand Parameter**
   - Test or check SDK types for correct parameter name
   - Likely needs change from `flowId` to `flowIdentifier`

3. **Flow Definition Loading**
   - Ensure JSON file is bundled with Lambda
   - Or embed definition in code

### Priority 2: Verification Needed

1. **Event Pattern Structure**
   - Verify detail structure matches actual S3 EventBridge events
   - May need adjustment based on actual event format

2. **CreateFlowCommand Definition Parameter**
   - Verify if `FlowDefinition` wrapper is correct
   - Check if definition should be passed directly

---

## Recommended Next Steps

### Immediate (Before Deployment)
1. ✅ Add S3 EventBridge notification configuration
2. ✅ Verify and fix InvokeFlowCommand parameter
3. ✅ Test Lambda bundling includes JSON file

### Testing Required
1. Test Flow creation with actual JSON structure
2. Test EventBridge rule with actual S3 upload
3. Test OpenSearch client authentication in Lambda environment

### Documentation References
1. **Bedrock Flows API**: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_CreateFlow.html
2. **Bedrock Runtime API**: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeFlow.html
3. **S3 EventBridge**: https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventBridge.html
4. **CDK Lambda Bundling**: https://docs.aws.amazon.com/cdk/api/v2/docsamd/aws-cdk-lib.aws_lambda_nodejs-readme.html

---

## Code Fixes to Apply

### Fix 1: Add S3 EventBridge Notification
```typescript
// Add to intelligent-doc-processor-stack.ts after bucket creation
docsBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.EventBridgeDestination()
);
```

### Fix 2: Verify Flow Invocation Parameter
```javascript
// Check SDK types - may need to change:
// flowId → flowIdentifier
// flowInput → input (check SDK)
```

### Fix 3丑陋: Ensure JSON Bundling
```typescript
// Add to NodejsFunction options:
bundling: {
  externalModules: [],
  nodeModules: [],
  // Or embed JSON in code
}
```


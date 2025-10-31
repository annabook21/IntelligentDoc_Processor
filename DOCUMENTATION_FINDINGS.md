# AWS Documentation Findings and Required Fixes

## Summary

After searching AWS documentation, I found that **specific API parameter names need verification through testing or direct SDK inspection**. However, I identified several **critical issues** that need immediate fixes based on AWS best practices:

## 🚨 Critical Issues Found

### 1. MISSING: S3 EventBridge Notification Configuration
**Status**: ❌ **NOT CONFIGURED**  
**Impact**: EventBridge rule will NEVER trigger - Flow invoker Lambda will never run

**Current State**: 
- EventBridge rule exists (lines 198-208)
- S3 bucket exists (line 58)
- **BUT**: S3 bucket is NOT configured to send events to EventBridge

**AWS Documentation**: 
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventBridge.html
- S3 requires explicit EventBridge notification configuration

**Fix Required**:
```typescript
// Add to intelligent-doc-processor-stack.ts after bucket creation:
import * as s3n from "aws-cdk-lib/aws-s3-notifications";

// After docsBucket creation, add:
docsBucket.addEventNotification(
  s3.EventType.OBJECT_CREATED,
  new s3n.EventBridgeDestination()
);
```

---

### 2. INVOKE_FLOW_PARAMETER: Needs Verification
**Status**: ⚠️ **UNCERTAIN**  
**Location**: `flow-invoker.js` line 44

**Current Code**:
```javascript
const invokeCommand = new InvokeFlowCommand({
  flowId: process.env.FLOW_ID,  // ❓ Verify parameter name
  flowInput: JSON.stringify(flowInput),
  contentType: "application/json",
  accept: "application/json",
});
```

**Action Required**: 
- Check SDK TypeScript definitions: `node_modules/@aws-sdk/client-bedrock-runtime/dist-types/commands/InvokeFlowCommand.d.ts`
- Parameter may be `flowIdentifier` instead of `flowId`
- Input parameter may be `input` instead of `flowInput`

**AWS API Reference**:
- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeFlow.html

---

### 3. FLOW_DEFINITION_STRUCTURE: Needs Verification
**Status**: ⚠️ **UNCERTAIN**  
**Location**: `flow-creator.js` lines 84-89

**Current Code**:
```javascript
const createCommand = new CreateFlowCommand({
  flowName: flowName,
  description: description,
  definition: flowDefinition,  // ❓ Structure unclear
});
```

**Issue**: `flowDefinition` is loaded from JSON with `FlowDefinition` wrapper, but API may expect different structure

**Action Required**: Check if:
1. Definition should be `flowDefinition.FlowDefinition` (unwrap)
2. Or pass `flowDefinition` as-is
3. Or API expects different parameter name

**AWS API Reference**:
- https://docs.aws.amazon.com/bedrock/latest/APIReference/API_CreateFlow.html

---

### 4. LAMBDA_JSON_BUNDLING: Needs Verification
**Status**: ⚠️ **UNCERTAIN**  
**Location**: `flow-creator.js` lines 31-34

**Current Code**:
```javascript
const flowDefinitionPath = path.join(__dirname, "document-processing-flow.json");
const flowJson = fs.readFileSync(flowDefinitionPath, "utf-8");
```

**Issue**: NodejsFunction bundling may not include JSON files by default

**Action Required**: 
1. Test if JSON file is bundled
2. If not, either:
   - Configure bundling to include JSON
   - Embed JSON as constant in code
   - Load from S3 or Parameter Store

**CDK Documentation**:
- https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs-readme.html

---

### 5. OPENSEARCH_AUTHENTICATION: Needs Verification
**Status**: ⚠️ **UNCERTAIN**  
**Location**: `api-handler.js` lines 60-64

**Current Code**:
```javascript
const opensearchClient = new Client({
  node: `https://${opensearchEndpoint}`,
  auth: { credentials: defaultProvider() },
  ssl: { rejectUnauthorized: false },  // ⚠️ Security concern
});
```

**Issues**:
1. `defaultProvider()` may not work correctly in Lambda
2. `rejectUnauthorized: false` is insecure (bypasses certificate validation)

**AWS Documentation**:
- OpenSearch Service access from Lambda: https://docs.aws.amazon.com/opensearch-service/latest/developerguide/ac.html
- Recommended: Use IAM-based authentication with AWS signature v4

**Fix Recommended**:
```javascript
const { defaultProvider } = require("@aws-sdk/credential-providers");
const { Client } = require("@opensearch-project/opensearch");
const { AwsSigv4Signer } = require("@opensearch-project/opensearch/aws");

const client = new Client({
  ...AwsSigv4Signer({
    region: process.env.AWS_REGION,
    credentials: defaultProvider(),
  }),
  node: `https://${opensearchEndpoint}`,
});
```

---

## Immediate Actions Required

### Priority 1: Must Fix Before Deployment

1. ✅ **Add S3 EventBridge Notification** (Code fix available)
2. ⚠️ **Verify InvokeFlowCommand parameters** (Check SDK or test)
3. ⚠️ **Verify CreateFlowCommand definition structure** (Check SDK or test)

### Priority 2: Should Fix

4. ⚠️ **Fix OpenSearch authentication** (Security issue)
5. ⚠️ **Verify Lambda JSON bundling** (Test or embed in code)

---

## Testing Checklist

Before deploying to production, test:

- [ ] S3 upload triggers EventBridge event
- [ ] EventBridge event reaches Lambda
- [ ] Lambda can read Flow ID from environment
- [ ] InvokeFlowCommand succeeds
- [ ] CreateFlowCommand succeeds with JSON structure
- [ ] Flow Creator Lambda can read JSON file
- [ ] OpenSearch client authenticates correctly
- [ ] API endpoints work end-to-end

---

## Recommended Fix Implementation Order

1. **Add S3 EventBridge notification** (known fix)
2. **Fix OpenSearch authentication** (security fix)
3. **Test Flow creation/invocation** (verify parameters)
4. **Fix JSON bundling** (if needed)
5. **Add comprehensive error handling**


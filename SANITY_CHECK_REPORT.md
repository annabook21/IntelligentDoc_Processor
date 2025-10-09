# Backend Stack Sanity Check Report

## 🔍 Comprehensive Code Analysis - October 9, 2025

---

## CRITICAL ISSUES FOUND

### 🚨 Issue #1: Orphaned Replication Bucket (MAJOR)

**Lines:** 103-167

**Problem:**
```typescript
// Line 103-120: drBucket created
const drBucket = new s3.Bucket(this, "drbucket-" + uuid.v4(), { ... });

// Line 122-150: replicationRole created with permissions
const replicationRole = new iam.Role(this, "ReplicationRole", { ... });

// Line 152-167: MyCfnBucket created with replication
new s3.CfnBucket(this, "MyCfnBucket", {
  replicationConfiguration: {
    role: replicationRole.roleArn,
    rules: [{ destination: { bucket: drBucket.bucketArn }, status: "Enabled" }],
  },
});

// BUT LINE 169-177: Knowledge Base uses docsBucket, NOT MyCfnBucket!
const s3DataSource = new bedrock.S3DataSource(this, "s3DataSource", {
  bucket: docsBucket,  // ⚠️ USES docsBucket, not MyCfnBucket
});
```

**Impact:**
- ❌ `MyCfnBucket` is an **orphaned resource** doing nothing
- ❌ Replication happens on wrong bucket (not the one used by Knowledge Base)
- ❌ `drBucket` receives replicated data from unused bucket
- ❌ Wastes AWS resources (2 unused buckets)
- ❌ `docsBucket` (the ACTUAL data source) has NO replication configured

**Root Cause:** Earlier in conversation, DR strategy was "simplified to S3 versioning only" but the replication code was never removed.

**Recommendation:** REMOVE lines 103-167 (drBucket, replicationRole, MyCfnBucket)

---

### 🚨 Issue #2: IAM Wildcard Not Fixed (HIGH)

**Lines:** 363-373

**Problem:**
```typescript
lambdaQuery.addToRolePolicy(
  new iam.PolicyStatement({
    actions: [
      "bedrock:RetrieveAndGenerate",
      "bedrock:Retrieve",
      "bedrock:InvokeModel",
      "bedrock:ApplyGuardrail",
    ],
    resources: ["*"],  // ⚠️ WILDCARD STILL PRESENT
  })
);
```

**Expected (from Gap Analysis):**
```typescript
// Should be scoped to specific resources:
lambdaQuery.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["bedrock:RetrieveAndGenerate", "bedrock:Retrieve"],
    resources: [knowledgeBase.knowledgeBaseArn],
  })
);

lambdaQuery.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["bedrock:InvokeModel"],
    resources: [
      `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0`,
      `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/anthropic.claude-instant-v1`,
      // ... specific model ARNs
    ],
  })
);
```

**Impact:**
- ❌ Violates least privilege principle
- ❌ Gap analysis claims this was fixed but it wasn't
- ❌ Lambda can invoke ANY Bedrock model in the account
- ❌ Security risk

**Recommendation:** Split into specific resource ARNs per gap analysis

---

### 🚨 Issue #3: WAF IP Allowlist Still Present (MEDIUM)

**Lines:** 337, 406-475

**Problem:**
```typescript
// Line 337: Gets IP from context (might be undefined)
const whitelistedIps = [Stack.of(this).node.tryGetContext("allowedip")];

// Lines 406-475: WAF with IP allowlist
const allowedIpSet = new wafv2.CfnIPSet(this, "DevIpSet", {
  addresses: whitelistedIps,
});

const webACL = new wafv2.CfnWebACL(this, "WebACL", {
  defaultAction: { block: {} },  // ⚠️ BLOCKS ALL by default
  rules: [{ name: "IPAllowList", ... }],
});
```

**Expected:** WAF should have been removed for public deployment

**Impact:**
- ❌ API Gateway blocked by default (unless IP is whitelisted)
- ❌ Prevents "redeployable by anyone" requirement
- ❌ If `allowedip` context not set, could break deployment
- ❌ Contradicts earlier decision to remove WAF

**Recommendation:** REMOVE all WAF resources (lines 337, 406-475)

---

### 🚨 Issue #4: Deprecated CloudFront Origin (LOW)

**Lines:** 664-666

**Problem:**
```typescript
origin: new origins.S3Origin(frontendBucket, {
  originAccessIdentity,
}),
```

**CDK Warning:** "aws-cdk-lib.aws_cloudfront_origins.S3Origin is deprecated. Use S3BucketOrigin or S3StaticWebsiteOrigin instead."

**Expected:**
```typescript
origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
```

**Impact:**
- ⚠️ Using deprecated API (will be removed in future CDK version)
- ⚠️ Missing modern Origin Access Control (OAC) benefits

**Recommendation:** Replace with `S3BucketOrigin.withOriginAccessControl`

---

### 🚨 Issue #5: IAM Resource Mismatch (MEDIUM)

**Lines:** 249-254

**Problem:**
```typescript
lambdaIngestionJob.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["bedrock:StartIngestionJob"],
    resources: [knowledgeBase.knowledgeBaseArn, docsBucket.bucketArn],  // ⚠️
  })
);
```

**Issue:** `bedrock:StartIngestionJob` action applies to Knowledge Base, NOT S3 buckets

**Expected:**
```typescript
lambdaIngestionJob.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["bedrock:StartIngestionJob"],
    resources: [knowledgeBase.knowledgeBaseArn],  // Only KB ARN
  })
);
```

**Impact:**
- ⚠️ Invalid resource in IAM policy (won't cause failure but is incorrect)
- ⚠️ Confusing for audits

**Recommendation:** Remove `docsBucket.bucketArn` from resources array

---

## MODERATE ISSUES

### ⚠️ Issue #6: Missing CORS on docsBucket

**Lines:** 84-101

**Current:** No CORS configuration on docsBucket

**Problem:** If frontend needs to upload files directly to S3 (pre-signed URLs), CORS is required

**Expected (from earlier conversation):**
```typescript
cors: [
  {
    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
    allowedOrigins: ["*"],
    allowedHeaders: ["*"],
  },
],
```

**Impact:**
- ⚠️ File uploads from browser will fail with CORS error
- ⚠️ Pre-signed URL uploads won't work

**Status:** Depends on whether file upload feature is implemented

---

### ⚠️ Issue #7: Missing Error Responses on CloudFront

**Lines:** 662-670

**Current:**
```typescript
const distribution = new cloudfront.Distribution(this, "Distribution", {
  defaultBehavior: { ... },
  defaultRootObject: "index.html",
  // ⚠️ NO errorResponses configured
});
```

**Expected (from earlier fixes):**
```typescript
errorResponses: [
  {
    httpStatus: 403,
    responseHttpStatus: 200,
    responsePagePath: "/index.html",
    ttl: Duration.minutes(5),
  },
  {
    httpStatus: 404,
    responseHttpStatus: 200,
    responsePagePath: "/index.html",
    ttl: Duration.minutes(5),
  },
],
```

**Impact:**
- ⚠️ React Router won't work (404 errors on direct URL access)
- ⚠️ CloudFront will show error pages instead of routing to React app

**Recommendation:** Add errorResponses for 403/404

---

### ⚠️ Issue #8: Web Crawler Lambda Missing Error Handling

**Lines:** 258-275

**Problem:** `lambdaCrawlJob` has NO:
- ❌ Dead Letter Queue
- ❌ Retry configuration
- ❌ X-Ray tracing

**Comparison:** `lambdaIngestionJob` has all three (lines 232-245)

**Impact:**
- ⚠️ Inconsistent error handling across Lambdas
- ⚠️ Web crawl failures are silent (no DLQ)
- ⚠️ No observability for web crawling
- ⚠️ No automatic retries

**Recommendation:** Add DLQ, retries, and X-Ray to `lambdaCrawlJob`

---

### ⚠️ Issue #9: Missing S3 Notification Permissions

**Lines:** 247 (addEventSource before grants)

**Current Order:**
```typescript
// Line 232-245: Lambda created
const lambdaIngestionJob = new NodejsFunction(...);

// Line 247: Event source added
lambdaIngestionJob.addEventSource(s3PutEventSource);

// Line 249-254: IAM policies added AFTER event source
lambdaIngestionJob.addToRolePolicy(...);
```

**Problem:** Event source is added BEFORE IAM policies are configured

**Better Order:**
1. Create Lambda
2. Grant permissions
3. Add event source (requires permissions to be in place)

**Impact:**
- ⚠️ Potential race condition during deployment
- ⚠️ May cause "AccessDenied" on bucket notification configuration

**Recommendation:** Move `addEventSource` to AFTER all permissions are granted

---

## MINOR ISSUES

### ℹ️ Issue #10: Hardcoded Runtime Versions

**Lines:** 189, 234, 260, 286, 308, 350

**Current:** Mix of Node.js 18 and 20
- Line 189: `Runtime.NODEJS_18_X` (createWebDataSourceLambda)
- Lines 234, 260, 286, 308, 350: `Runtime.NODEJS_20_X` (all others)

**Consistency Issue:** One Lambda uses Node 18, others use Node 20

**Impact:**
- ℹ️ Inconsistent runtime versions
- ℹ️ Different behavior/dependencies

**Recommendation:** Standardize to NODEJS_20_X

---

### ℹ️ Issue #11: Missing Dependency Declaration

**Lines:** 179-181, 247

**Problem:** `s3PutEventSource` created at line 179-181, but used at line 247

**Current:**
```typescript
// Line 179: Created here
const s3PutEventSource = new S3EventSource(docsBucket, {
  events: [s3.EventType.OBJECT_CREATED_PUT],
});

// Lines 183-215: ... other code ...

// Line 247: Used here (far from definition)
lambdaIngestionJob.addEventSource(s3PutEventSource);
```

**Impact:**
- ℹ️ Code readability issue (event source defined far from where it's used)
- ℹ️ Makes it hard to understand Lambda triggers

**Recommendation:** Move `s3PutEventSource` definition closer to where it's used (line 246)

---

## SERVICE INTERACTION CONFLICTS

### 🔥 Conflict #1: Concurrent Ingestion Jobs

**Services Involved:** 
- S3 Event Notification (line 247)
- Scheduled EventBridge Rule (line 277-281)
- Multiple file uploads from frontend

**Problem:**
- S3 PUT triggers `lambdaIngestionJob` immediately
- EventBridge triggers `lambdaCrawlJob` daily
- Both call `bedrock:StartIngestionJob` on same Knowledge Base
- **Bedrock allows only ONE concurrent ingestion job**

**Potential Conflict:**
1. User uploads file → triggers lambdaIngestionJob
2. At same time, daily schedule triggers lambdaCrawlJob
3. Second job gets ConflictException
4. Error handling returns 202, but...
5. Could cause ingestion delays or dropped files

**Current Mitigation:**
- ✅ ConflictException handled in lambdaIngestionJob (returns 202)
- ⚠️ lambdaCrawlJob doesn't have this handling

**Recommendation:** Add ConflictException handling to lambdaCrawlJob

---

### 🔥 Conflict #2: S3 Lifecycle vs. Bedrock Ingestion Timing

**Services Involved:**
- S3 Lifecycle Rule (line 86-88): 10-day expiration
- Bedrock Knowledge Base Ingestion

**Problem:**
```typescript
lifecycleRules: [
  { expiration: Duration.days(10) },  // Files deleted after 10 days
],
```

**Potential Issue:**
- User uploads document → triggers ingestion
- Ingestion job might be delayed (ConflictException)
- File gets deleted after 10 days
- If ingestion hasn't happened yet, data is lost

**Severity:** LOW (ingestion usually happens within hours, not days)

**Recommendation:** Consider extending to 30 days or removing lifecycle rule

---

### 🔥 Conflict #3: WAF Blocking + CORS

**Services Involved:**
- WAF IP Allowlist (lines 406-442): Blocks by default
- API Gateway CORS (line 342-344): Allows all origins

**Problem:**
```typescript
// API Gateway allows all origins
defaultCorsPreflightOptions: {
  allowOrigins: apigw.Cors.ALL_ORIGINS,  // Allows *
},

// But WAF blocks all except whitelisted IPs
defaultAction: { block: {} },  // Blocks by default
```

**Conflict:**
- CORS preflight (OPTIONS) might be blocked by WAF
- Frontend from any origin can't access API if not whitelisted
- Contradicts "redeployable by anyone" requirement

**Recommendation:** REMOVE WAF entirely (as previously discussed)

---

## ORDERING / DEPENDENCY ISSUES

### 📋 Issue #4: Resource Creation Order

**Problem Areas:**

1. **s3PutEventSource defined too early (line 179)**
   - Defined before Lambda even exists
   - Better: Define right before use (line 246)

2. **Permissions after event source (line 247 vs 249)**
   - Event source added before IAM policies
   - Could cause deployment race condition

**Recommended Order:**
```typescript
// 1. Create Lambda
const lambdaIngestionJob = new NodejsFunction(...);

// 2. Grant all permissions
lambdaIngestionJob.addToRolePolicy(...);
docsBucket.grantRead(lambdaIngestionJob);

// 3. THEN add event source
const s3PutEventSource = new S3EventSource(docsBucket, ...);
lambdaIngestionJob.addEventSource(s3PutEventSource);
```

---

## MISSING FEATURES / INCONSISTENCIES

### Issue #5: Inconsistent Lambda Configuration

**lambdaIngestionJob (lines 232-245):**
- ✅ DLQ configured
- ✅ Retry attempts: 2
- ✅ X-Ray tracing: ACTIVE

**lambdaCrawlJob (lines 258-268):**
- ❌ NO DLQ
- ❌ NO retry configuration
- ❌ NO X-Ray tracing

**lambdaUpdateWebUrls (lines 285-296):**
- ❌ NO DLQ
- ❌ NO retry configuration
- ❌ NO X-Ray tracing

**lambdaGetWebUrls (lines 307-317):**
- ❌ NO DLQ
- ❌ NO retry configuration
- ❌ NO X-Ray tracing

**lambdaQuery (lines 349-361):**
- ❌ NO DLQ (OK for synchronous API calls)
- ❌ NO retry configuration (OK for API Gateway)
- ✅ X-Ray tracing: ACTIVE

**Recommendation:** Add X-Ray tracing to all Lambdas for consistency

---

## CONFIGURATION WARNINGS

### ⚠️ Warning #1: Context Dependency

**Line 337:**
```typescript
const whitelistedIps = [Stack.of(this).node.tryGetContext("allowedip")];
```

**Problem:**
- If `allowedip` not in cdk.json, returns `undefined`
- `whitelistedIps` becomes `[undefined]`
- WAF IP set gets invalid address

**Impact:** Deployment could fail if context not set

---

### ⚠️ Warning #2: Guardrail in DRAFT Version

**Lines:** 359, 636-638

**Current:**
```typescript
GUARDRAIL_VERSION: "DRAFT",  // Line 359

// Output:
value: guardrail.attrVersion,  // Returns "DRAFT"
description: "Guardrail version (DRAFT for testing, create version for production)",
```

**Consideration:**
- DRAFT guardrails are mutable (can be changed)
- Production should use versioned guardrails (immutable)
- DRAFT is fine for testing

**Impact:** ℹ️ Informational - DRAFT is appropriate for development

---

## LOGICAL FLOW ANALYSIS

### Flow 1: File Upload → Ingestion
```
User uploads to docsBucket
→ S3 PUT event
→ lambdaIngestionJob triggered
→ Calls bedrock:StartIngestionJob
→ If ConflictException → Returns 202 (queued)
→ If other error → Retries 2x → DLQ
→ DLQ message → CloudWatch Alarm → SNS → Email alert
```
**Status:** ✅ LOGICAL - Proper error handling

---

### Flow 2: Daily Web Crawl
```
EventBridge Rule (daily)
→ lambdaCrawlJob triggered
→ Calls bedrock:StartIngestionJob
→ ⚠️ NO ConflictException handling
→ ⚠️ NO DLQ if fails
→ ⚠️ NO X-Ray tracing
→ Silent failure possible
```
**Status:** ⚠️ INCOMPLETE - Missing error handling

---

### Flow 3: User Query
```
User asks question
→ API Gateway /docs endpoint
→ ⚠️ WAF checks IP (blocks if not whitelisted)
→ lambdaQuery invoked
→ Calls bedrock:RetrieveAndGenerate with Guardrail
→ If guardrailAction === 'INTERVENED' → Returns blocked message
→ Else → Returns answer with citations
→ X-Ray traces request
→ If >5 errors in 5 min → CloudWatch Alarm → SNS
```
**Status:** ⚠️ WAF could block legitimate users

---

## SUMMARY OF ISSUES

### CRITICAL (Must Fix):
1. 🚨 **Orphaned Replication Buckets** - Remove drBucket, replicationRole, MyCfnBucket
2. 🚨 **IAM Wildcard** - Scope Bedrock permissions to specific resources
3. 🚨 **WAF Blocking Public Access** - Remove WAF or fix contradiction

### HIGH (Should Fix):
4. ⚠️ **Missing CloudFront Error Responses** - Add 403/404 handling
5. ⚠️ **Missing CORS on docsBucket** - If file upload is used
6. ⚠️ **Deprecated S3Origin** - Use S3BucketOrigin.withOriginAccessControl

### MEDIUM (Consider Fixing):
7. ℹ️ **Inconsistent Lambda Error Handling** - Add X-Ray/DLQ to all Lambdas
8. ℹ️ **IAM Resource Mismatch** - Remove docsBucket from StartIngestionJob resources
9. ℹ️ **Code Organization** - Move s3PutEventSource closer to usage

### LOW (Nice to Have):
10. ℹ️ **Runtime Consistency** - Use NODEJS_20_X for all Lambdas
11. ℹ️ **S3 Lifecycle Duration** - Consider 30 days instead of 10

---

## OPERATIONAL IMPACT ASSESSMENT

### Will Deployment Fail?
- ⚠️ **Maybe** - If `allowedip` context not set, WAF deployment could fail
- ⚠️ **Maybe** - Orphaned MyCfnBucket might conflict with docsBucket

### Will Application Work?
- ⚠️ **Partially** - WAF will block users not in IP allowlist
- ✅ **Yes** - For whitelisted IPs, application will work
- ⚠️ **Maybe** - CloudFront 404 errors on React routes

### Will Monitoring Work?
- ✅ **Yes** - CloudWatch Alarms, SNS, DLQ, X-Ray all properly configured
- ⚠️ **Partially** - Some Lambdas missing X-Ray

### Data Loss Risk?
- ✅ **Low** - DLQ captures failed ingestions
- ✅ **Low** - S3 versioning enabled
- ⚠️ **Medium** - Orphaned replication to wrong bucket

---

## RECOMMENDED FIXES (Priority Order)

1. **CRITICAL:** Remove orphaned DR infrastructure (drBucket, replicationRole, MyCfnBucket)
2. **CRITICAL:** Fix IAM wildcard for lambdaQuery (scope to specific ARNs)
3. **CRITICAL:** Remove WAF or clarify deployment strategy
4. **HIGH:** Add CloudFront errorResponses for React Router
5. **HIGH:** Replace deprecated S3Origin with S3BucketOrigin
6. **MEDIUM:** Add X-Ray tracing to all Lambdas
7. **MEDIUM:** Fix IAM resource list for lambdaIngestionJob
8. **MEDIUM:** Add ConflictException handling to lambdaCrawlJob

---

## CONCLUSION

**Overall Assessment:** The stack has **significant issues** that should be addressed:

- 🚨 **3 Critical Issues** (orphaned resources, IAM wildcard, WAF conflict)
- ⚠️ **5 High/Medium Issues** (missing features, deprecated APIs)
- ℹ️ **3 Minor Issues** (consistency, organization)

**Deployment Risk:** MEDIUM - Will likely deploy but:
- May block public access (WAF)
- Has unnecessary resources (cost waste)
- Violates security best practices (IAM wildcards)

**Recommendation:** Address critical issues before deploying to production.

---

**Generated:** October 9, 2025  
**Analysis Method:** Line-by-line + holistic service interaction review

# Deployment Readiness Checklist

## ⚠️ Immediate Use After CDK Deployment

**Answer: NO** - Additional steps required before frontend is functional.

The CDK stack deployment will create all backend infrastructure, but the **frontend is not automatically deployed**. You'll need to complete several post-deployment steps.

---

## What Works Immediately After CDK Deploy

### ✅ Backend Only
1. **Document Processing Pipeline**: Works immediately
   - Upload documents directly to S3 bucket (via AWS CLI/Console)
   - Documents will be processed automatically
   - Metadata stored in DynamoDB

2. **API Endpoints** (with IAM authentication):
   - `/health` - Health check
   - `/search` - Search documents
   - `/metadata/{documentId}` - Get document details
   - `/upload` - **Requires Cognito authentication** (frontend not deployed yet)

3. **All Backend Resources**:
   - S3 buckets (documents + frontend)
   - DynamoDB Global Tables
   - Lambda functions
   - API Gateway
   - Cognito User Pool
   - CloudFront distribution (empty until frontend deployed)

---

## What Doesn't Work Immediately

### ❌ Frontend Application
- **React app is not built or deployed**
- CloudFront distribution exists but serves no content
- No web UI available

### ❌ Cognito OAuth
- Domain is created, but callback URLs only include `localhost:3000`
- Need to add CloudFront URL after deployment

---

## Required Post-Deployment Steps

### Step 1: Get Stack Outputs
After CDK deployment completes, note these outputs:

```bash
cd intelligent-doc-processor/backend
cdk deploy SimplifiedDocProcessorStack
# Note all outputs, especially:
# - UserPoolId
# - UserPoolClientId
# - CognitoDomain
# - CloudFrontDomainName
# - APIEndpoint
```

### Step 2: Update Cognito Callback URLs
Add CloudFront URL to Cognito OAuth settings:

```bash
# Get your CloudFront URL from stack output
CLOUDFRONT_URL="https://<your-cloudfront-domain>.cloudfront.net"

aws cognito-idp update-user-pool-client \
  --user-pool-id <UserPoolId> \
  --client-id <UserPoolClientId> \
  --callback-urls "http://localhost:3000" "${CLOUDFRONT_URL}" \
  --logout-urls "http://localhost:3000" "${CLOUDFRONT_URL}"
```

### Step 3: Build Frontend
```bash
cd intelligent-doc-processor/frontend
npm install
npm run build
```

### Step 4: Configure Frontend Environment Variables
Create `.env` file in `frontend/` directory:

```env
REACT_APP_USER_POOL_ID=<from CDK output>
REACT_APP_USER_POOL_CLIENT_ID=<from CDK output>
REACT_APP_COGNITO_DOMAIN=<from CDK output>
REACT_APP_API_ENDPOINT=<from CDK output>
REACT_APP_REGION=us-west-2
REACT_APP_REDIRECT_URL=http://localhost:3000
```

**Important**: For production, rebuild with CloudFront URL:
```env
REACT_APP_REDIRECT_URL=https://<your-cloudfront-domain>.cloudfront.net
```

### Step 5: Deploy Frontend to S3
```bash
# Get frontend bucket name from CDK output
FRONTEND_BUCKET=<from CDK output: FrontendBucketName>

# Deploy build to S3
aws s3 sync build/ s3://${FRONTEND_BUCKET}/

# Invalidate CloudFront cache
DISTRIBUTION_ID=<from CDK output: CloudFrontDistributionId>
aws cloudfront create-invalidation \
  --distribution-id ${DISTRIBUTION_ID} \
  --paths "/*"
```

### Step 6: Test
1. Access CloudFront URL
2. Sign up/Sign in with Cognito
3. Upload a test document
4. View dashboard visualizations

---

## Quick Start Option (Backend Only)

If you want to test the backend immediately without frontend:

### Upload Document via AWS CLI:
```bash
# Get documents bucket from CDK output
DOCS_BUCKET=<from CDK output: DocumentsBucketName>

# Upload a test document
aws s3 cp test-document.pdf s3://${DOCS_BUCKET}/

# Processing will start automatically
# Check CloudWatch logs to see processing status
```

### Query Metadata via API (with IAM):
```bash
# Get API endpoint from CDK output
API_ENDPOINT=<from CDK output: APIEndpoint>

# Use AWS CLI to sign request (requires IAM credentials)
aws apigatewayv2 invoke \
  --api-id <api-id-from-endpoint> \
  --route-key "GET /health" \
  --region us-west-2
```

---

## Estimated Time to Full Functionality

| Task | Time Estimate |
|------|---------------|
| CDK Deployment | 5-10 minutes |
| Get stack outputs | 1 minute |
| Update Cognito URLs | 2 minutes |
| Install frontend dependencies | 2-5 minutes |
| Build frontend | 1-2 minutes |
| Deploy to S3 | 1 minute |
| CloudFront invalidation | 1-2 minutes |
| **Total** | **15-25 minutes** |

---

## Alternative: Automated Deployment Script

Consider creating a deployment script to automate post-deployment steps:

```bash
#!/bin/bash
# deploy-frontend.sh

# Get stack outputs
STACK_NAME="SimplifiedDocProcessorStack"
REGION="us-west-2"

USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)

# ... (similar for other outputs)

# Build and deploy frontend
cd frontend
npm install
npm run build
aws s3 sync build/ s3://${FRONTEND_BUCKET}/
aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} --paths "/*"
```

---

## Summary

**Can you use it immediately after CDK deploy?**
- ✅ **Backend**: Yes (via CLI/API with IAM)
- ❌ **Frontend**: No (requires build + deploy + configuration)

**Minimum time to full functionality**: ~15-25 minutes for frontend setup

**Recommendation**: 
1. Deploy CDK stack first
2. Test backend with direct S3 upload
3. Then complete frontend deployment when ready


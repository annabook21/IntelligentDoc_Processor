# Quick Start Guide

## Option 1: Test Backend Immediately (5 minutes)

After `cdk deploy`, you can test the backend without frontend:

```bash
# 1. Get the documents bucket name from CDK output
cd intelligent-doc-processor/backend
cdk deploy SimplifiedDocProcessorStack

# Note the output: DocumentsBucketName

# 2. Upload a test document
aws s3 cp test-document.pdf s3://<DocumentsBucketName>/

# 3. Processing starts automatically!
# Check CloudWatch logs:
aws logs tail /aws/lambda/doc-processor-us-west-2 --follow

# 4. Query results via API (requires IAM signing)
API_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name SimplifiedDocProcessorStack \
  --query "Stacks[0].Outputs[?OutputKey=='APIEndpoint'].OutputValue" \
  --output text)

# Use AWS CLI to call API (auto-signs with your IAM credentials)
aws apigatewayv2 invoke \
  --api-id $(echo $API_ENDPOINT | cut -d/ -f3 | cut -d. -f1) \
  --route-key "GET /health" \
  --region us-west-2
```

## Option 2: Full Frontend Setup (15-25 minutes)

### Step 1: Deploy Backend (5-10 min)
```bash
cd intelligent-doc-processor/backend
npm install
cdk deploy SimplifiedDocProcessorStack
```

### Step 2: Capture Stack Outputs (1 min)
```bash
# Save these outputs - you'll need them:
aws cloudformation describe-stacks \
  --stack-name SimplifiedDocProcessorStack \
  --query "Stacks[0].Outputs" \
  --output table
```

### Step 3: Update Cognito URLs (2 min)
```bash
# Get CloudFront domain from stack output
CLOUDFRONT_URL="https://<CloudFrontDomainName>"

aws cognito-idp update-user-pool-client \
  --user-pool-id <UserPoolId> \
  --client-id <UserPoolClientId> \
  --callback-urls "http://localhost:3000" "${CLOUDFRONT_URL}" \
  --logout-urls "http://localhost:3000" "${CLOUDFRONT_URL}"
```

### Step 4: Build Frontend (3-5 min)
```bash
cd ../frontend
npm install
npm run build
```

### Step 5: Configure Environment (2 min)
Create `frontend/.env`:
```env
REACT_APP_USER_POOL_ID=<from stack output>
REACT_APP_USER_POOL_CLIENT_ID=<from stack output>
REACT_APP_COGNITO_DOMAIN=<from stack output>
REACT_APP_API_ENDPOINT=<from stack output>
REACT_APP_REGION=us-west-2
REACT_APP_REDIRECT_URL=<CloudFront URL from stack output>
```

**Important**: Rebuild after updating `.env`:
```bash
npm run build
```

### Step 6: Deploy to S3 (1 min)
```bash
FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name SimplifiedDocProcessorStack \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
  --output text)

aws s3 sync build/ s3://${FRONTEND_BUCKET}/
```

### Step 7: Invalidate CloudFront (1 min)
```bash
DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name SimplifiedDocProcessorStack \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
  --output text)

aws cloudfront create-invalidation \
  --distribution-id ${DIST_ID} \
  --paths "/*"
```

### Step 8: Access!
Wait 1-2 minutes for CloudFront propagation, then:
- Open CloudFront URL from stack outputs
- Sign up/Sign in with Cognito
- Upload documents
- View visualizations!

## Troubleshooting

**Frontend shows blank page?**
- Check CloudFront invalidation completed
- Verify `.env` file has correct values
- Rebuild: `npm run build` and redeploy

**Cognito login fails?**
- Verify callback URLs include CloudFront URL
- Check Cognito domain is correct in `.env`

**Upload fails?**
- Verify API endpoint in `.env`
- Check CloudWatch logs for errors


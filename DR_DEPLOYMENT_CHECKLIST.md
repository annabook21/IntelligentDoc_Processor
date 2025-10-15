# Disaster Recovery Deployment Checklist

## 🎯 Objective
Deploy full multi-region stack with automatic CloudFront origin failover (frontend) and manual backend API failover capability.

---

## ✅ Pre-Deployment Checklist

- [ ] AWS CLI configured on deployment machine
- [ ] Docker Desktop running on deployment machine
- [ ] Account ID known: `aws sts get-caller-identity --query Account --output text`
- [ ] Bedrock model access enabled in BOTH us-west-2 and us-east-1

---

## 📋 Step-by-Step Deployment

### Step 1: Enable Bedrock Models in Both Regions

**⚠️ CRITICAL: Do this BEFORE deploying**

**For us-west-2:**
1. Go to: https://us-west-2.console.aws.amazon.com/bedrock/home?region=us-west-2#/modelaccess
2. Click **"Manage model access"**
3. Enable:
   - ✅ `amazon.titan-embed-text-v1` (Titan Embeddings G1 - Text)
   - ✅ `anthropic.claude-3-sonnet-20240229-v1:0` (Anthropic Claude 3 Sonnet)
4. Click **"Save changes"**
5. Wait for **"Access granted"** status

**For us-east-1:**
1. Go to: https://us-east-1.console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess
2. Repeat the same steps

---

### Step 2: Bootstrap Both Regions

```bash
# Get your account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Account ID: $ACCOUNT_ID"

# Bootstrap us-west-2
cdk bootstrap aws://$ACCOUNT_ID/us-west-2

# Bootstrap us-east-1
cdk bootstrap aws://$ACCOUNT_ID/us-east-1
```

---

### Step 3: Deploy to Both Regions

```bash
# Navigate to backend directory
cd backend

# Deploy to BOTH regions simultaneously (15-20 minutes total)
cdk deploy --all
```

**During deployment, you'll see:**

**Primary Region (us-west-2):**
- Creating Lambda functions (5 total)
- Creating Knowledge Base
- Creating S3 buckets (documents + frontend)
- Creating API Gateway
- Creating CloudFront distribution (with origin group pointing to both S3 buckets)
- Creating CloudWatch Dashboard

**Failover Region (us-east-1):**
- Creating Lambda functions (5 total)
- Creating Knowledge Base
- Creating S3 buckets (documents + frontend)
- Creating API Gateway
- Creating CloudWatch Dashboard
- **Note:** CloudFront is NOT created here (it's global, created only in primary)

**Expected outputs:**

**Primary Stack (BackendStack-Primary):**
```
Outputs:
BackendStack-Primary.APIGatewayUrl = https://abc123.execute-api.us-west-2.amazonaws.com/prod/
BackendStack-Primary.HealthEndpoint = https://abc123.execute-api.us-west-2.amazonaws.com/prod/health
BackendStack-Primary.CloudFrontURL = d1234abcd.cloudfront.net
BackendStack-Primary.DocsBucketName = docsbucket-primary-xxxxx
BackendStack-Primary.FrontendBucketName = chatbox-frontend-{account}-us-west-2
```

**Failover Stack (BackendStack-Failover):**
```
Outputs:
BackendStack-Failover.APIGatewayUrl = https://xyz789.execute-api.us-east-1.amazonaws.com/prod/
BackendStack-Failover.HealthEndpoint = https://xyz789.execute-api.us-east-1.amazonaws.com/prod/health
BackendStack-Failover.DocsBucketName = docsbucket-failover-xxxxx
BackendStack-Failover.FrontendBucketName = chatbox-frontend-{account}-us-east-1
```

**SAVE THESE VALUES!**

---

### Step 4: Verify Deployment

```bash
# Test primary health endpoint
curl https://abc123.execute-api.us-west-2.amazonaws.com/prod/health | jq

# Test failover health endpoint
curl https://xyz789.execute-api.us-east-1.amazonaws.com/prod/health | jq

# Both should return: {"status": "healthy", "region": "...", ...}
```

---

### Step 5: Test Frontend Failover (Optional)

Frontend failover is **automatic**. To verify it works:

1. Access the CloudFront URL in your browser
2. Open browser DevTools → Network tab
3. The frontend loads from CloudFront (which fetches from us-west-2 S3 by default)
4. If us-west-2 S3 returns 5xx, CloudFront automatically retries us-east-1 S3

**You cannot easily simulate this without breaking the primary S3 bucket.**

---

### Step 6: Configure S3 Cross-Region Replication (Optional)

Follow Step 2 from DISASTER_RECOVERY_SETUP.md to enable automatic document replication.

---

## 📊 Deployment Summary

After completing all steps, you'll have:

| Component | Primary (us-west-2) | Failover (us-east-1) |
|-----------|--------------------|--------------------|
| API Gateway | ✅ Deployed | ✅ Deployed |
| Lambda Functions | ✅ 5 functions | ✅ 5 functions |
| Bedrock Knowledge Base | ✅ Active | ✅ Active |
| S3 Documents | ✅ Source | ✅ Replica (if CRR configured) |
| S3 Frontend | ✅ Primary origin | ✅ Failover origin |
| CloudFront | ✅ Active (global, uses both S3 origins) | ❌ Not deployed (uses primary CF) |
| Health Endpoint | ✅ /health | ✅ /health |

**Failover Behavior:**

**Frontend (CloudFront Origin Failover - AUTOMATIC):**
- Primary S3 healthy → CloudFront serves from us-west-2
- Primary S3 returns 5xx → CloudFront instantly retries us-east-1
- RTO: < 1 second
- RPO: 0 (both buckets have identical content)
- **No manual intervention needed**

**Backend API (Manual Failover):**
- Default: Frontend uses primary API URL from config.json
- On failure: Manually update config.json to point to failover API URL
- RTO: Manual (depends on detection and response time)
- RPO: 0 (stateless API)

**Documents (S3 Cross-Region Replication - if configured):**
- RPO: 0-15 minutes (S3 replication time)

---

## 🧪 Verification Commands

```bash
# Check both regions deployed
aws cloudformation describe-stacks --stack-name BackendStack-Primary --region us-west-2 --query 'Stacks[0].StackStatus'
aws cloudformation describe-stacks --stack-name BackendStack-Failover --region us-east-1 --query 'Stacks[0].StackStatus'

# Both should return: "CREATE_COMPLETE" or "UPDATE_COMPLETE"

# Test both health endpoints
curl https://abc123.execute-api.us-west-2.amazonaws.com/prod/health
curl https://xyz789.execute-api.us-east-1.amazonaws.com/prod/health

# Check S3 replication (if configured)
aws s3api get-bucket-replication --bucket $PRIMARY_BUCKET --region us-west-2

# Verify CloudFront distribution exists
aws cloudformation describe-stacks \
  --stack-name BackendStack-Primary \
  --region us-west-2 \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
  --output text
```

---

## 💰 Total Cost

| Item | Cost |
|------|------|
| Primary Region (us-west-2) | $7/month |
| Failover Region (us-east-1) | $7/month |
| S3 Replication (data transfer) | ~$0.20/month (for 10GB) |
| **TOTAL** | **~$14-15/month** |

**For ~$14/month, you get automatic frontend DR + full backend redundancy.**

---

## 🎯 Success Criteria

- [ ] Both regions show `CREATE_COMPLETE` status
- [ ] CloudFront distribution created in primary region only
- [ ] Both frontend S3 buckets exist (us-west-2 and us-east-1)
- [ ] Both `/health` endpoints return `"status": "healthy"`
- [ ] S3 documents replication configured (optional)
- [ ] Both CloudWatch Dashboards accessible
- [ ] CloudFront serves frontend from primary S3 origin (test by accessing CloudFront URL)
- [ ] config.json exists in both frontend S3 buckets with primary API URL

---

## 📞 Troubleshooting Quick Reference

**Deployment Fails:**
- Check Docker is running: `docker ps`
- Verify Bedrock models enabled in BOTH regions
- Check bootstrap completed: `aws ssm get-parameter --name /cdk-bootstrap/version --region us-west-2`

**Health Check Fails:**
- Test endpoint directly: `curl -v https://API-URL/health`
- Check Lambda logs: `aws logs tail /aws/lambda/api-health-check --follow --region us-west-2`
- Verify Knowledge Base exists: `aws bedrock-agent list-knowledge-bases --region us-west-2`

**Replication Not Working:**
- Verify both buckets have versioning enabled
- Check IAM role trust policy
- Test replication: upload file to primary, check failover bucket after 15 min

**Frontend Not Loading:**
- Verify CloudFront distribution exists in primary region
- Check both frontend S3 buckets have build files
- Test CloudFront URL directly in browser

---

**Ready to deploy? Start with Step 1!** 🚀

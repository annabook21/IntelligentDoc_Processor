# Disaster Recovery Deployment Checklist

## 🎯 Objective
Deploy FULL failover stack to us-east-1 with Route 53 health checks and automatic failover.

---

## ✅ Pre-Deployment Checklist

- [ ] Primary region (us-west-2) deployed and healthy
- [ ] Health endpoint tested: `curl https://YOUR-API-URL/health` returns 200
- [ ] AWS CLI configured on deployment machine
- [ ] Docker Desktop running on deployment machine
- [ ] Account ID known: `aws sts get-caller-identity --query Account --output text`

---

## 📋 Step-by-Step Deployment

### Step 1: Enable Bedrock Models in us-east-1

**⚠️ CRITICAL: Do this BEFORE deploying**

1. Go to: https://us-east-1.console.aws.amazon.com/bedrock/home?region=us-east-1#/modelaccess
2. Click **"Manage model access"**
3. Enable these TWO models:
   - ✅ `amazon.titan-embed-text-v1` (Titan Embeddings G1 - Text)
   - ✅ `anthropic.claude-3-sonnet-20240229-v1:0` (Anthropic Claude 3 Sonnet)
4. Click **"Save changes"**
5. Wait for status to show **"Access granted"** (2-3 minutes)

**Verify:**
```bash
aws bedrock list-foundation-models --region us-east-1 | grep -E "(titan-embed-text|claude-3-sonnet)"
```

Should show both models.

---

### Step 2: Bootstrap us-east-1

On your deployment machine:

```bash
# Get your account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Account ID: $ACCOUNT_ID"

# Bootstrap us-east-1
cdk bootstrap aws://$ACCOUNT_ID/us-east-1
```

**Expected output:**
```
✅ Environment aws://123456789012/us-east-1 bootstrapped.
```

---

### Step 3: Deploy Full Stack to us-east-1

```bash
# Navigate to backend directory
cd /path/to/Chatbot_proto/backend

# Deploy to BOTH regions simultaneously (will take 15-20 minutes total)
cdk deploy --all
```

**During deployment, you'll see:**

**Primary Region (us-west-2):**
- Creating Lambda functions (5 total including health check)
- Creating Knowledge Base
- Creating S3 buckets (documents + frontend)
- Creating API Gateway
- Creating CloudFront distribution (with origin group to both regions)
- Creating CloudWatch Dashboard

**Failover Region (us-east-1):**
- Creating Lambda functions (5 total including health check)
- Creating Knowledge Base
- Creating S3 buckets (documents + frontend)
- Creating API Gateway
- Creating CloudWatch Dashboard
- **Note:** CloudFront is NOT created in failover region (it's global, created only in primary)

**Expected outputs at the end:**

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

**SAVE THESE VALUES - YOU'LL NEED THEM!**

---

### Step 4: Test Failover Region

```bash
# Test health endpoint
curl https://xyz789.execute-api.us-east-1.amazonaws.com/prod/health | jq

# Should return:
# {
#   "status": "healthy",
#   "region": "us-east-1",
#   "checks": { ... }
# }

# Test query endpoint (optional - requires document upload)
curl -X POST https://xyz789.execute-api.us-east-1.amazonaws.com/prod/docs \
  -H "Content-Type: application/json" \
  -d '{"question": "test"}'
```

---

### Step 5: Configure S3 Cross-Region Replication

**Get bucket names:**

```bash
# Primary bucket (us-west-2)
PRIMARY_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name BackendStack \
  --region us-west-2 \
  --query 'Stacks[0].Outputs[?OutputKey==`DocsBucketName`].OutputValue' \
  --output text)

# Failover bucket (us-east-1)
FAILOVER_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name BackendStack \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`DocsBucketName`].OutputValue' \
  --output text)

echo "Primary Bucket: $PRIMARY_BUCKET"
echo "Failover Bucket: $FAILOVER_BUCKET"
```

**Create replication role:**

```bash
# Create IAM role for replication
aws iam create-role \
  --role-name S3ReplicationRole-ChatbotDR \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "s3.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Get account ID for policy
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Attach replication policy
cat > /tmp/replication-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetReplicationConfiguration",
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::$PRIMARY_BUCKET"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObjectVersionForReplication",
        "s3:GetObjectVersionAcl",
        "s3:GetObjectVersionTagging"
      ],
      "Resource": "arn:aws:s3:::$PRIMARY_BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ReplicateObject",
        "s3:ReplicateDelete",
        "s3:ReplicateTags"
      ],
      "Resource": "arn:aws:s3:::$FAILOVER_BUCKET/*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name S3ReplicationRole-ChatbotDR \
  --policy-name S3ReplicationPolicy \
  --policy-document file:///tmp/replication-policy.json
```

**Enable replication:**

```bash
cat > /tmp/replication-config.json << EOF
{
  "Role": "arn:aws:iam::$ACCOUNT_ID:role/S3ReplicationRole-ChatbotDR",
  "Rules": [{
    "Status": "Enabled",
    "Priority": 1,
    "DeleteMarkerReplication": {"Status": "Disabled"},
    "Filter": {},
    "Destination": {
      "Bucket": "arn:aws:s3:::$FAILOVER_BUCKET",
      "ReplicationTime": {
        "Status": "Enabled",
        "Time": {"Minutes": 15}
      },
      "Metrics": {
        "Status": "Enabled",
        "EventThreshold": {"Minutes": 15}
      }
    }
  }]
}
EOF

aws s3api put-bucket-replication \
  --bucket $PRIMARY_BUCKET \
  --region us-west-2 \
  --replication-configuration file:///tmp/replication-config.json
```

**Verify replication:**
```bash
aws s3api get-bucket-replication --bucket $PRIMARY_BUCKET --region us-west-2
```

Should show: `"Status": "Enabled"`

---

### Step 6: Create Route 53 Health Checks

**Get API Gateway URLs:**

```bash
PRIMARY_API=$(aws cloudformation describe-stacks \
  --stack-name BackendStack \
  --region us-west-2 \
  --query 'Stacks[0].Outputs[?OutputKey==`APIGatewayUrl`].OutputValue' \
  --output text | sed 's|https://||' | sed 's|/prod/||')

FAILOVER_API=$(aws cloudformation describe-stacks \
  --stack-name BackendStack \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`APIGatewayUrl`].OutputValue' \
  --output text | sed 's|https://||' | sed 's|/prod/||')

echo "Primary API: $PRIMARY_API"
echo "Failover API: $FAILOVER_API"
```

**Create health check for primary:**

```bash
aws route53 create-health-check \
  --caller-reference primary-chatbot-$(date +%s) \
  --health-check-config \
    Type=HTTPS,\
ResourcePath=/prod/health,\
FullyQualifiedDomainName=$PRIMARY_API,\
Port=443,\
RequestInterval=30,\
FailureThreshold=3,\
MeasureLatency=true
```

**SAVE THE HealthCheckId FROM OUTPUT!**

```bash
# Example output:
# "HealthCheck": {
#   "Id": "a1b2c3d4-5678-90ab-cdef-EXAMPLE11111"
# }

PRIMARY_HEALTH_CHECK_ID="a1b2c3d4-5678-90ab-cdef-EXAMPLE11111"  # Replace with actual
```

**Create health check for failover:**

```bash
aws route53 create-health-check \
  --caller-reference failover-chatbot-$(date +%s) \
  --health-check-config \
    Type=HTTPS,\
ResourcePath=/prod/health,\
FullyQualifiedDomainName=$FAILOVER_API,\
Port=443,\
RequestInterval=30,\
FailureThreshold=3,\
MeasureLatency=true
```

**SAVE THE HealthCheckId FROM OUTPUT!**

```bash
FAILOVER_HEALTH_CHECK_ID="b2c3d4e5-6789-01bc-defg-EXAMPLE22222"  # Replace with actual
```

**Verify health checks:**

```bash
aws route53 get-health-check-status --health-check-id $PRIMARY_HEALTH_CHECK_ID
aws route53 get-health-check-status --health-check-id $FAILOVER_HEALTH_CHECK_ID
```

Both should show `"Status": "Success"` from multiple checker locations.

---

### Step 7: Configure Route 53 Failover Routing

**Option A: With Custom Domain (Recommended)**

If you have a domain in Route 53:

```bash
# Get your hosted zone ID
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones \
  --query 'HostedZones[0].Id' \
  --output text | cut -d'/' -f3)

echo "Hosted Zone: $HOSTED_ZONE_ID"

# Create primary record
cat > /tmp/primary-record.json << EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "api.yourdomain.com",
      "Type": "CNAME",
      "SetIdentifier": "Primary-us-west-2",
      "Failover": "PRIMARY",
      "TTL": 60,
      "ResourceRecords": [{"Value": "$PRIMARY_API"}],
      "HealthCheckId": "$PRIMARY_HEALTH_CHECK_ID"
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file:///tmp/primary-record.json

# Create failover record
cat > /tmp/failover-record.json << EOF
{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "api.yourdomain.com",
      "Type": "CNAME",
      "SetIdentifier": "Failover-us-east-1",
      "Failover": "SECONDARY",
      "TTL": 60,
      "ResourceRecords": [{"Value": "$FAILOVER_API"}],
      "HealthCheckId": "$FAILOVER_HEALTH_CHECK_ID"
    }
  }]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file:///tmp/failover-record.json
```

**Test DNS:**
```bash
dig api.yourdomain.com
# Should return primary API Gateway URL
```

---

**Option B: Without Custom Domain**

**Frontend:** Already has automatic failover via CloudFront origin groups (no action needed).

**Backend API:** The frontend loads API URL from `config.json`. Without Route 53:
1. Frontend will continue using the primary API URL from config.json
2. If primary API fails, users will experience errors until:
   - You manually update config.json to point to failover API, OR
   - You implement client-side retry logic in the frontend

**Recommendation:** Use Option A (Route 53) for automatic backend API failover.

---

### Step 8: Test Failover

**Monitor health checks:**

```bash
watch -n 10 'echo "=== PRIMARY ===" && aws route53 get-health-check-status --health-check-id '$PRIMARY_HEALTH_CHECK_ID' --query "HealthCheckObservations[0].StatusReport.Status" && echo "=== FAILOVER ===" && aws route53 get-health-check-status --health-check-id '$FAILOVER_HEALTH_CHECK_ID' --query "HealthCheckObservations[0].StatusReport.Status"'
```

**Simulate primary failure (OPTIONAL - destructive):**

```bash
# Disable the health Lambda in us-west-2 (causes health check to fail)
aws lambda update-function-configuration \
  --function-name api-health-check \
  --region us-west-2 \
  --environment Variables={KNOWLEDGE_BASE_ID=INVALID}

# Watch Route 53 detect failure (takes ~90 seconds)
# After 3 failures, Route 53 routes traffic to us-east-1

# Restore primary
aws lambda update-function-configuration \
  --function-name api-health-check \
  --region us-west-2 \
  --environment Variables={KNOWLEDGE_BASE_ID=<ORIGINAL_VALUE>}
```

---

## 📊 Deployment Summary

After completing all steps, you'll have:

| Component | Primary (us-west-2) | Failover (us-east-1) |
|-----------|--------------------|--------------------|
| API Gateway | ✅ Deployed | ✅ Deployed |
| Lambda Functions | ✅ 5 functions | ✅ 5 functions |
| Bedrock Knowledge Base | ✅ Active | ✅ Active |
| S3 Documents | ✅ Source | ✅ Replica (auto-sync) |
| S3 Frontend | ✅ Primary origin | ✅ Failover origin |
| CloudFront | ✅ Active (global, uses both S3 origins) | ❌ Not deployed (uses primary CF) |
| Health Endpoint | ✅ /health | ✅ /health |
| Route 53 Health Check | ✅ Monitoring | ✅ Monitoring |

**Failover Behavior:**

**Frontend (CloudFront Origin Failover):**
- Primary S3 healthy → CloudFront serves from us-west-2
- Primary S3 returns 5xx → CloudFront instantly retries us-east-1
- RTO: < 1 second
- RPO: 0 (both buckets have identical content)

**Backend API (Route 53 DNS Failover):**
- Primary API healthy → Traffic to us-west-2
- Primary unhealthy (3 checks / 90 sec) → DNS routes to us-east-1
- Primary restored → Traffic back to us-west-2
- RTO: ~2-3 minutes (health check detection + DNS TTL)
- RPO: 0 (stateless API)

**Documents (S3 Cross-Region Replication):**
- RPO: 0-15 minutes (S3 replication time)

---

## 🧪 Verification Commands

```bash
# Check both regions deployed
aws cloudformation describe-stacks --stack-name BackendStack --region us-west-2 --query 'Stacks[0].StackStatus'
aws cloudformation describe-stacks --stack-name BackendStack --region us-east-1 --query 'Stacks[0].StackStatus'

# Both should return: "CREATE_COMPLETE" or "UPDATE_COMPLETE"

# Test both health endpoints
curl https://$(aws cloudformation describe-stacks --stack-name BackendStack --region us-west-2 --query 'Stacks[0].Outputs[?OutputKey==`HealthEndpoint`].OutputValue' --output text)
curl https://$(aws cloudformation describe-stacks --stack-name BackendStack --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`HealthEndpoint`].OutputValue' --output text)

# Check S3 replication
aws s3api get-bucket-replication --bucket $PRIMARY_BUCKET --region us-west-2

# Check health check statuses
aws route53 get-health-check-status --health-check-id $PRIMARY_HEALTH_CHECK_ID
aws route53 get-health-check-status --health-check-id $FAILOVER_HEALTH_CHECK_ID
```

---

## 💰 Total Cost

| Item | Cost |
|------|------|
| Primary Region (us-west-2) | $7/month |
| Failover Region (us-east-1) | $7/month |
| Route 53 Health Checks (2) | $1/month |
| S3 Replication (data transfer) | ~$0.20/month (for 10GB) |
| **TOTAL** | **~$15/month** |

**For ~$15/month, you get enterprise-grade DR with <3 minute RTO.**

---

## 🎯 Success Criteria

- [ ] Both regions show `CREATE_COMPLETE` status
- [ ] CloudFront distribution created in primary region only
- [ ] Both frontend S3 buckets exist (us-west-2 and us-east-1)
- [ ] Both `/health` endpoints return `"status": "healthy"`
- [ ] Both Route 53 health checks show `"Status": "Success"`
- [ ] S3 documents replication is `"Enabled"`
- [ ] Test document uploads to primary appear in failover bucket within 15 min
- [ ] Both CloudWatch Dashboards accessible
- [ ] Route 53 failover routing configured (if using custom domain)
- [ ] CloudFront serves frontend from primary S3 origin (test by accessing CloudFront URL)

---

## 📞 Troubleshooting Quick Reference

**Deployment Fails:**
- Check Docker is running: `docker ps`
- Verify Bedrock models enabled in us-east-1
- Check bootstrap completed: `aws ssm get-parameter --name /cdk-bootstrap/version --region us-east-1`

**Health Check Fails:**
- Test endpoint directly: `curl -v https://API-URL/health`
- Check Lambda logs: `aws logs tail /aws/lambda/api-health-check --follow --region us-east-1`
- Verify Knowledge Base exists: `aws bedrock-agent list-knowledge-bases --region us-east-1`

**Replication Not Working:**
- Verify both buckets have versioning enabled
- Check IAM role trust policy
- Test replication: upload file to primary, check failover bucket after 15 min

---

**Ready to start? Begin with Step 1 on your deployment machine!** 🚀


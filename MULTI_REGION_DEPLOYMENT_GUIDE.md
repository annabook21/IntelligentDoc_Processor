# Multi-Region Deployment Guide

## Overview

This AWS Contextual Chatbot can be deployed to multiple AWS regions to:
- **Reduce latency** for users in different geographical locations
- **Improve availability** through regional redundancy
- **Meet data residency requirements** for specific regions

---

## Supported Regions

Based on AWS CDK documentation and common deployment patterns, this stack can be deployed to:

| Region | Region Name | Status |
|--------|-------------|--------|
| `us-west-2` | Oregon | ✅ Verified working |
| `us-east-1` | N. Virginia | ⚠️ Verify Bedrock models |
| `us-east-2` | Ohio | ⚠️ Verify Bedrock models |

---

## ⚠️ CRITICAL PRE-DEPLOYMENT REQUIREMENT

### Verify Bedrock Model Availability

**Before deploying to any region**, you **MUST** verify that the following models are available:

1. **Titan Embeddings G1 - Text**: `amazon.titan-embed-text-v1`
2. **Anthropic Claude 3 Sonnet**: `anthropic.claude-3-sonnet-20240229-v1:0`

### How to Verify:

1. Navigate to the **[Amazon Bedrock console](https://console.aws.amazon.com/bedrock/home)** in your AWS account
2. **Switch to the target region** using the region selector in the top-right
3. In the bottom-left corner, click on **Model access**
4. Verify that both models are listed and available
5. If not available, click **Manage model access** and enable them

**⚠️ If models are not available in a region, deployment will succeed but the application will fail at runtime.**

---

## Deployment Methods

### Method 1: Deploy to Single Region (Recommended for Testing)

Deploy to one region at a time by setting the AWS CLI region:

#### Step 1: Set your target region
```bash
export AWS_DEFAULT_REGION=us-east-1  # or us-east-2, us-west-2
```

#### Step 2: Bootstrap the region (first time only)
```bash
# Replace with your AWS account ID
cdk bootstrap aws://123456789012/us-east-1
```

#### Step 3: Enable Bedrock model access
1. Go to Bedrock Console in the target region
2. Enable `amazon.titan-embed-text-v1`
3. Enable `anthropic.claude-3-sonnet-20240229-v1:0`

#### Step 4: Deploy
```bash
cd backend
cdk deploy
```

#### Step 5: Verify deployment
The CloudFormation outputs will show:
- CloudFront URL (global)
- API Gateway URL (region-specific)
- Dashboard Name (region-specific)

---

### Method 2: Deploy to Multiple Regions Sequentially

Deploy the same stack to multiple regions:

```bash
# Deploy to us-west-2
export AWS_DEFAULT_REGION=us-west-2
cdk bootstrap aws://123456789012/us-west-2
cdk deploy

# Deploy to us-east-1
export AWS_DEFAULT_REGION=us-east-1
cdk bootstrap aws://123456789012/us-east-1
cdk deploy

# Deploy to us-east-2
export AWS_DEFAULT_REGION=us-east-2
cdk bootstrap aws://123456789012/us-east-2
cdk deploy
```

**⚠️ Important**: Each deployment creates a **separate, independent stack**. They do not share resources.

---

## Regional Considerations

### Resource Naming

Some resources are **region-specific** and will be created separately in each region:

- **Lambda Functions**: Separate functions per region
- **S3 Buckets**: Unique bucket names required (auto-generated with UUIDs)
- **Knowledge Bases**: Separate knowledge base per region
- **API Gateway**: Regional endpoints
- **CloudWatch Dashboards**: Separate dashboard per region

### Global Resources

Some resources are **globally distributed**:

- **CloudFront Distribution**: Automatically serves content from edge locations worldwide
- **Frontend S3 Bucket**: One per region (behind CloudFront)

### Cross-Region Architecture

If deploying to multiple regions, consider:

1. **Traffic Routing**: Use Route 53 latency-based routing to direct users to nearest region
2. **Data Synchronization**: S3 Cross-Region Replication for document synchronization
3. **Monitoring**: Centralized CloudWatch dashboards showing all regions
4. **Cost**: Multiply estimated costs by number of deployed regions

---

## Verifying Deployment

### 1. Check CloudFormation Stack

```bash
aws cloudformation describe-stacks \
  --stack-name BackendStack \
  --region us-east-1 \
  --query 'Stacks[0].StackStatus'
```

Should return: `"CREATE_COMPLETE"` or `"UPDATE_COMPLETE"`

### 2. Test Lambda Functions

```bash
# Get Query Lambda function name
aws lambda list-functions \
  --region us-east-1 \
  --query 'Functions[?contains(FunctionName, `query-bedrock-llm`)].FunctionName'

# Invoke it with a test event
aws lambda invoke \
  --function-name query-bedrock-llm \
  --region us-east-1 \
  --payload '{"body": "{\"question\":\"test\"}"}' \
  response.json
```

### 3. Check Bedrock Knowledge Base

```bash
# List knowledge bases in the region
aws bedrock-agent list-knowledge-bases --region us-east-1
```

### 4. Access CloudWatch Dashboard

Navigate to:
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=contextual-chatbot-metrics
```

---

## Troubleshooting Multi-Region Deployments

### Issue: "You don't have access to the model"

**Cause**: Bedrock model access not enabled in the target region

**Solution**:
1. Go to Bedrock Console in the **specific region**
2. Enable model access for both Titan Embeddings and Claude 3 Sonnet
3. Wait 2-3 minutes for access to propagate
4. Redeploy if necessary: `cdk deploy --force`

---

### Issue: "Stack already exists"

**Cause**: Trying to deploy the same stack name twice

**Solution**:
```bash
# Destroy existing stack first
cdk destroy

# Or use different stack names per region
# Modify bin/backend.ts to use region-specific names
```

---

### Issue: S3 bucket name conflicts

**Cause**: S3 bucket names must be globally unique

**Solution**: The stack uses UUID-based bucket names, so this should not occur. If it does, check for manual bucket creation.

---

### Issue: Bootstrap version mismatch

**Cause**: CDK bootstrap version differs between regions

**Solution**:
```bash
# Re-bootstrap with latest CDK
npm install -g aws-cdk@latest
cdk bootstrap --force aws://123456789012/us-east-1
```

---

## Cost Implications

### Per-Region Costs

Each regional deployment incurs separate costs:

| Service | Monthly Cost (per region) | Notes |
|---------|--------------------------|-------|
| Lambda | ~$0.10 | 500 queries |
| API Gateway | Free Tier | First 1M requests free |
| S3 | ~$0.10 | 5 GB storage |
| OpenSearch Serverless | ~$2.64 | Main cost driver |
| Bedrock (Titan) | ~$0.10 | 1M tokens |
| Bedrock (Claude) | ~$3.50 | 500 queries |
| CloudWatch | ~$0.50 | Logs + Dashboard |
| **Total per region** | **~$6.94** | For light usage |

### Multi-Region Total

- **2 regions**: ~$13.88/month
- **3 regions**: ~$20.82/month

### Shared Costs (Global)

- **CloudFront**: ~$0.10/month (10 GB transfer, Free Tier applies)

---

## Best Practices

### 1. Enable Model Access First
Always enable Bedrock model access **before** deploying to avoid runtime failures.

### 2. Bootstrap Once per Region
Only need to bootstrap each region once per AWS account.

### 3. Use Consistent AWS CLI Configuration
Set `AWS_DEFAULT_REGION` before **every** CDK command to avoid confusion.

### 4. Tag Resources
Add tags to identify which region resources belong to:
```typescript
cdk.Tags.of(app).add('Region', process.env.CDK_DEFAULT_REGION || 'unknown');
```

### 5. Monitor All Regions
Set up CloudWatch cross-region dashboards to monitor all deployments.

### 6. Test Before Production
Deploy to a single region first, verify functionality, then expand to other regions.

---

## Region Selection Guide

### us-west-2 (Oregon)
- ✅ **Proven working** with this application
- ✅ Lowest latency for West Coast US
- ✅ Comprehensive Bedrock model availability
- 💡 **Recommended** as primary region

### us-east-1 (N. Virginia)
- ✅ Largest AWS region with most services
- ✅ Lowest latency for East Coast US
- ⚠️ **Verify Bedrock model availability**
- ⚠️ Occasionally experiences capacity constraints
- 💡 Good for East Coast users

### us-east-2 (Ohio)
- ✅ Good alternative to us-east-1
- ✅ Lower latency for Midwest US
- ⚠️ **Verify Bedrock model availability**
- 💡 Good backup region for us-east-1

---

## Advanced: Programmatic Multi-Region Deployment

For advanced users wanting to deploy to all regions programmatically:

### Option A: Loop Script

Create `deploy-all-regions.sh`:
```bash
#!/bin/bash

REGIONS=("us-west-2" "us-east-1" "us-east-2")
ACCOUNT_ID="123456789012"  # Replace with your account ID

for region in "${REGIONS[@]}"; do
  echo "🚀 Deploying to $region..."
  export AWS_DEFAULT_REGION=$region
  
  # Bootstrap if needed
  cdk bootstrap aws://$ACCOUNT_ID/$region
  
  # Deploy
  cdk deploy --require-approval never
  
  echo "✅ Deployment to $region complete!"
done
```

### Option B: Modify bin/backend.ts

Create separate stack instances:

```typescript
const regions = ['us-west-2', 'us-east-1', 'us-east-2'];

regions.forEach(region => {
  new BackendStack(app, `BackendStack-${region}`, {
    env: { 
      account: process.env.CDK_DEFAULT_ACCOUNT, 
      region: region 
    },
    description: `AWS Contextual Chatbot with Bedrock RAG (Region: ${region})`,
  });
});
```

Then deploy all:
```bash
cdk deploy --all
```

---

## Rollback and Cleanup

### Destroy Single Region

```bash
export AWS_DEFAULT_REGION=us-east-1
cdk destroy
```

### Destroy All Regions

```bash
for region in us-west-2 us-east-1 us-east-2; do
  export AWS_DEFAULT_REGION=$region
  cdk destroy --force
done
```

---

## References

- **AWS CDK Environments**: https://docs.aws.amazon.com/cdk/latest/guide/environments.html
- **AWS Multi-Region Architecture**: https://aws.amazon.com/blogs/architecture/creating-a-multi-region-application-with-aws-services-part-1-compute-and-security/
- **Amazon Bedrock Documentation**: https://docs.aws.amazon.com/bedrock/
- **AWS Regional Services**: https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/

---

## Support

If you encounter issues with multi-region deployment:

1. Check CloudFormation stack events: `aws cloudformation describe-stack-events --stack-name BackendStack --region <region>`
2. Verify Bedrock model access in the target region
3. Check CloudWatch Logs for Lambda errors
4. Review the troubleshooting section above

---

**Last Updated**: October 13, 2025  
**CDK Version**: aws-cdk-lib ^2.1029.0  
**Tested Regions**: us-west-2


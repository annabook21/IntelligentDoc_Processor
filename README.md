# Intelligent Document Processor

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![AWS](https://img.shields.io/badge/AWS-Serverless-orange)](https://aws.amazon.com/)
[![CDK](https://img.shields.io/badge/AWS-CDK-blue)](https://aws.amazon.com/cdk/)

A serverless AWS document processing pipeline that uses Amazon Bedrock Flows, Textract, and Comprehend to automatically extract intelligence from uploaded documents.

## 📚 Documentation

**Complete technical documentation is available in separate files:**

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Complete system architecture, components, security, and monitoring
- **[AWS_DIAGRAM_CREATION_GUIDE.md](AWS_DIAGRAM_CREATION_GUIDE.md)** - Step-by-step guide to create AWS architecture diagrams
- **[DIAGRAM_QUICK_REFERENCE.md](DIAGRAM_QUICK_REFERENCE.md)** - Printable checklist for diagram creation
- **[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)** - Central index and guide to all documentation
- **[images/COMPONENT_SPECIFICATIONS.md](images/COMPONENT_SPECIFICATIONS.md)** - Component specifications and reference tables

---

## 🏗️ Architecture Overview

### What Actually Deploys

This CDK stack deploys the following AWS resources:

**Core Services:**
- **S3 Bucket** - Document storage (KMS encrypted, versioned, EventBridge enabled)
- **Amazon Bedrock Flow** - Orchestrates document processing using Claude Sonnet 3
- **Lambda Functions (3)**:
  - `flow-creator` - Custom resource to create/manage Bedrock Flow
  - `flow-invoker` - Triggered by S3 events via EventBridge
  - `api-handler` - Consolidated API endpoint handler (in VPC)
- **DynamoDB Table** - Metadata storage with LanguageIndex GSI
- **OpenSearch Domain** - Full-text search (VPC-only, Multi-AZ)
- **API Gateway** - REST API with IAM authentication
- **VPC** - Private networking for OpenSearch and Lambda

**Security & Monitoring:**
- **KMS** - Customer-managed encryption key with auto-rotation
- **CloudTrail** - Audit logging
- **CloudWatch** - Logs, metrics, dashboard, and alarms
- **SNS** - Alert notifications
- **SQS DLQ** - Dead letter queue for failed Lambda invocations

**Cost Estimate:** ~$264/month (see [ARCHITECTURE.md](ARCHITECTURE.md) for breakdown)

### High-Level Flow

```
User uploads document to S3
    ↓
S3 triggers EventBridge event
    ↓
EventBridge invokes Flow Invoker Lambda
    ↓
Flow Invoker calls Bedrock Flow (Claude Sonnet 3)
    ↓
Flow orchestrates document processing
    ↓
Metadata stored in DynamoDB
    ↓
API Handler serves search/metadata queries via API Gateway
    ↓
OpenSearch provides full-text search (in VPC)
```

**For detailed architecture diagrams and component details, see [ARCHITECTURE.md](ARCHITECTURE.md)**

---

## 🚀 Quick Start

### Prerequisites

- **AWS Account** with Bedrock model access enabled
- **AWS CLI** v2.x configured with credentials
- **Node.js** v20.x or higher
- **AWS CDK** v2.x (`npm install -g aws-cdk`)
- **Docker Desktop** running (required for Lambda bundling)

### Enable Amazon Bedrock Models

1. Go to [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Click **Model access** (left sidebar)
3. Click **Manage model access**
4. Enable **Anthropic Claude Sonnet 3** (`anthropic.claude-3-sonnet-20240229-v1:0`)
5. Wait for status to show "Access granted"

### Deploy

```bash
# Clone repository
git clone https://github.com/annabook21/IntelligentDoc_Processor.git
cd IntelligentDoc_Processor/backend

# Install dependencies
npm install

# Bootstrap CDK (first time only)
export AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-west-2
cdk bootstrap aws://$AWS_ACCOUNT/$AWS_REGION

# Deploy stack (ensure Docker Desktop is running)
cdk deploy
```

**Deployment time:** ~10-15 minutes

### Post-Deployment

After deployment, note these outputs:
- `DocumentsBucketName` - S3 bucket for uploads
- `APIEndpoint` - API Gateway URL
- `FlowId` - Bedrock Flow ID
- `VPCId` - VPC ID
- `OpenSearchVpcEndpoint` - OpenSearch endpoint (VPC-only)
- `DashboardName` - CloudWatch dashboard name

---

## 📤 Upload Documents

### Via AWS CLI

```bash
# Get bucket name from deployment outputs
BUCKET_NAME="intelligent-docs-xxxxx"

# Upload document
aws s3 cp document.pdf s3://$BUCKET_NAME/

# Processing starts automatically
```

### Supported Formats

- PDF (including scanned documents)
- PNG, JPG, JPEG
- TIFF
- DOCX

---

## 🔍 Search Documents

### Health Check (No Auth Required)

```bash
API_ENDPOINT="https://xxxxx.execute-api.us-west-2.amazonaws.com/prod"
curl $API_ENDPOINT/health
```

### Search (IAM Authentication Required)

```bash
# Sign request with AWS credentials
aws apigatewayv2 invoke \
  --endpoint-url $API_ENDPOINT/search \
  --query-string language=en \
  response.json
```

**For API reference and authentication details, see [ARCHITECTURE.md](ARCHITECTURE.md#api-architecture)**

---

## 📊 Monitor Processing

### CloudWatch Dashboard

1. Go to [CloudWatch Console](https://console.aws.amazon.com/cloudwatch/)
2. Navigate to **Dashboards**
3. Open: `doc-processor-metrics-{region}`

**Metrics shown:**
- Flow invocations and errors
- DLQ message depth
- API Gateway requests and errors
- Lambda errors

### Check for Failures

```bash
# Get DLQ URL from outputs
DLQ_URL="https://sqs.us-west-2.amazonaws.com/xxxxx/lambda-dlq-us-west-2"

# Check for failed messages
aws sqs receive-message \
  --queue-url $DLQ_URL \
  --max-number-of-messages 10
```

### View Logs

```bash
# Flow Invoker logs
aws logs tail /aws/lambda/flow-invoker-us-west-2 --follow

# API Handler logs
aws logs tail /aws/lambda/doc-processor-api-us-west-2 --follow
```

---

## 🔒 Security

**What's Implemented:**
- ✅ KMS encryption at rest (S3, DynamoDB, OpenSearch, SQS)
- ✅ TLS 1.2+ in transit
- ✅ IAM authentication for API Gateway
- ✅ VPC isolation for OpenSearch (no public endpoint)
- ✅ Security Groups controlling network access
- ✅ CloudTrail audit logging
- ✅ VPC Gateway Endpoints (S3, DynamoDB)

**What's NOT Implemented:**
- ❌ No Cognito (uses IAM authentication)
- ❌ No CloudFront or frontend hosting
- ❌ No duplicate detection hash registry
- ❌ No multi-region replication (single-region only)

**For detailed security architecture, see [ARCHITECTURE.md](ARCHITECTURE.md#network--security-architecture)**

---

## 💰 Cost Estimate

**Estimated monthly cost for moderate usage:**

| Service | Cost |
|---------|------|
| OpenSearch (2x t3.small.search, Multi-AZ) | $120 |
| NAT Gateway + data transfer | $50 |
| Bedrock (1K invocations, Claude Sonnet 3) | $30 |
| DynamoDB (Pay-per-request) | $30 |
| Lambda (3 functions, moderate invocations) | $20 |
| CloudWatch (logs, metrics, dashboard) | $10 |
| S3 (100 GB storage) | $10 |
| API Gateway | $3.50 |
| KMS, SNS, SQS, CloudTrail | $5 |
| **Total** | **~$264/month** |

**Largest cost drivers:**
1. OpenSearch (45%) - Consider OpenSearch Serverless for cost savings
2. NAT Gateway (19%) - Single gateway, not HA
3. Bedrock (11%) - Depends on document volume

**For detailed cost breakdown and optimization strategies, see [ARCHITECTURE.md](ARCHITECTURE.md#cost-optimization)**

---

## 🛠️ Configuration

### Change Bedrock Model

Edit `backend/lib/intelligent-doc-processor-stack.ts`:

```typescript
const flowResource = new CustomResource(this, "DocumentProcessingFlow", {
  properties: {
    FlowName: `document-processing-flow-${this.region}`,
    // Update model ID in flow definition
  },
});
```

### Adjust S3 Lifecycle

Edit `backend/lib/intelligent-doc-processor-stack.ts`:

```typescript
docsBucket.addLifecycleRule({
  transitions: [
    { storageClass: s3.StorageClass.INTELLIGENT_TIERING, transitionAfter: Duration.days(30) },
    { storageClass: s3.StorageClass.GLACIER, transitionAfter: Duration.days(90) },
  ],
});
```

---

## 🧹 Cleanup

### Delete Stack

```bash
cd backend
cdk destroy
```

**Note:** Resources with `RemovalPolicy.RETAIN` will persist:
- KMS keys
- CloudTrail
- S3 buckets (must be manually emptied first)
- DynamoDB tables

### Force Delete S3 Buckets

```bash
# Empty bucket first
aws s3 rm s3://BUCKET_NAME --recursive

# Delete bucket
aws s3 rb s3://BUCKET_NAME --force
```

---

## 🐛 Troubleshooting

### Documents Not Processing

**Check:**
1. EventBridge rule is enabled
2. Flow Invoker Lambda has permissions
3. Bedrock Flow exists (`aws bedrock-agent list-flows`)
4. Check DLQ for error messages

**Logs:**
```bash
aws logs tail /aws/lambda/flow-invoker-us-west-2 --follow
```

### API Returns 403 Forbidden

**Cause:** API Gateway uses IAM authentication

**Solution:** Sign requests with AWS credentials:
```bash
aws apigatewayv2 invoke \
  --endpoint-url $API_ENDPOINT/search \
  response.json
```

Or use an IAM-authenticated HTTP client.

### OpenSearch Connection Timeout

**Cause:** OpenSearch is in VPC private subnet only

**Solution:** API Handler Lambda is already in VPC with correct security groups. If still failing:
1. Check Lambda is in correct VPC subnets
2. Verify Security Group allows HTTPS (443) from Lambda SG to OpenSearch SG
3. Check VPC endpoints exist (S3, DynamoDB)

**For more troubleshooting, see [ARCHITECTURE.md](ARCHITECTURE.md)**

---

## 📖 Additional Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Complete technical documentation
  - System architecture diagrams
  - Component details
  - Security architecture
  - Monitoring setup
  - Data storage schemas
  - DR analysis

- **[AWS_DIAGRAM_CREATION_GUIDE.md](AWS_DIAGRAM_CREATION_GUIDE.md)** - Create professional AWS diagrams
  - Tool setup (draw.io, Lucidchart)
  - Step-by-step instructions
  - Component placement guide
  - Official AWS styling

- **[DIAGRAM_QUICK_REFERENCE.md](DIAGRAM_QUICK_REFERENCE.md)** - Printable checklist
  - 35 components with checkboxes
  - 26 connections with checkboxes
  - Quick reference tables

- **[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)** - Central guide
  - Documentation overview
  - Quick start workflows
  - Tool recommendations

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- **Repository:** https://github.com/annabook21/IntelligentDoc_Processor
- **AWS Bedrock Documentation:** https://docs.aws.amazon.com/bedrock/
- **AWS CDK Documentation:** https://docs.aws.amazon.com/cdk/
- **OpenSearch Documentation:** https://docs.aws.amazon.com/opensearch-service/

---

## ⚠️ Important Notes

**What This Stack Does NOT Include:**

- ❌ **No Step Functions** - Uses Bedrock Flow instead
- ❌ **No Cognito User Pool** - Uses IAM authentication
- ❌ **No Frontend** - Backend infrastructure only
- ❌ **No CloudFront** - API Gateway direct access
- ❌ **No Multi-Region Replication** - Single region (us-west-2)
- ❌ **No Duplicate Detection** - Hash registry not implemented
- ❌ **No Separate Upload/Search Lambdas** - Consolidated API Handler

**For a detailed comparison with the original design, see [ARCHITECTURE.md](ARCHITECTURE.md#appendix-comparison-with-incorrect-architecture)**

---

**Questions?** Open an issue or see the [documentation](DOCUMENTATION_INDEX.md).

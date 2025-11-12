# Intelligent Document Processor

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![AWS](https://img.shields.io/badge/AWS-Serverless-orange)](https://aws.amazon.com/)
[![CDK](https://img.shields.io/badge/AWS-CDK-blue)](https://aws.amazon.com/cdk/)

A serverless AWS document processing pipeline that uses **Step Functions** to orchestrate Textract, Comprehend, and Bedrock (Claude Sonnet 3) for intelligent document analysis.

---

## 📚 Documentation

**Complete technical documentation is available in separate files:**

- **[ARCHITECTURE.md](ARCHITECTURE.md)** ⭐ START HERE - Complete system architecture, workflows, security, monitoring
- **[AWS_DIAGRAM_CREATION_GUIDE.md](AWS_DIAGRAM_CREATION_GUIDE.md)** 🎨 Step-by-step guide to create AWS diagrams
- **[DIAGRAM_QUICK_REFERENCE.md](DIAGRAM_QUICK_REFERENCE.md)** 📋 Printable checklist for diagram creation
- **[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)** 📖 Central index and guide to all documentation
- **[images/COMPONENT_SPECIFICATIONS.md](images/COMPONENT_SPECIFICATIONS.md)** 📊 Detailed component specifications

---

## 🏗️ Architecture Overview

### What's Actually Deployed

This CDK stack (`SimplifiedDocProcessorStackV3`) deploys:

**Core Processing:**
- ⚙️ **Step Functions State Machine** - Orchestrates the entire document processing workflow (30-min timeout)
- 📦 **S3 Documents Bucket** - Stores uploaded documents (KMS encrypted, versioned)
- ⚡ **EventBridge Rule** - Triggers Step Functions on S3 object creation
- 🔄 **8 Lambda Functions** (Node.js 20.x):
  - **API Functions (2):** Upload Handler, Search Handler
  - **Processing Functions (6):** Duplicate Check, Textract Start, Textract Status, Comprehend Analyze, Bedrock Summarize, Store Metadata

**AI Services:**
- 📄 **Amazon Textract** - OCR text extraction from documents
- 🔍 **Amazon Comprehend** - NLP: language detection, entities, key phrases
- 🤖 **Amazon Bedrock** - Claude Sonnet 3 for summarization and insights

**Data Storage:**
- 💾 **3 DynamoDB Global Tables** (with DR replication to us-east-2):
  - Metadata Table (PK: documentId, SK: processingDate, GSI: LanguageIndex)
  - Document Names Table (PK: documentId, GSI: S3KeyIndex)
  - Hash Registry Table (PK: contentHash for duplicate detection)

**Frontend & API:**
- ☁️ **CloudFront Distribution** - CDN for React frontend (HTTPS, HTTP/2)
- 📦 **S3 Frontend Bucket** - Hosts React SPA (KMS encrypted)
- 🌐 **API Gateway** - REST API with Cognito authorization (throttle: 100 req/s)
- 🔐 **Cognito User Pool** - User authentication (admin-create-only, OAuth 2.0)

**Security & Monitoring:**
- 🔑 **KMS Customer Managed Key** - Encrypts S3, SQS (auto-rotation enabled)
- 📋 **CloudTrail** - Audit logging with file validation
- 📊 **CloudWatch** - Logs (90-day retention), metrics, dashboard, alarms
- 📧 **SNS Topic** - Alert notifications for failures
- 📮 **SQS Dead Letter Queue** - Failed job storage (14-day retention)

**Cost Estimate:** ~$50-70/month for moderate usage (1,000 docs/month)

### What's NOT Implemented

❌ **Bedrock Flows** - Uses Step Functions instead  
❌ **OpenSearch** - No full-text search service deployed  
❌ **VPC** - All serverless, no custom VPC  
❌ **S3 Cross-Region Replication** - Only DynamoDB is replicated to DR region  
❌ **WAF** - No Web Application Firewall on API Gateway or CloudFront  

---

## 📐 High-Level Flow

```
User → CloudFront → React App
  ↓
Cognito Sign In (get token)
  ↓
POST /upload → Upload Lambda → Presigned S3 URL
  ↓
Browser uploads file to S3 Documents Bucket
  ↓
S3 Object Created → EventBridge → Step Functions State Machine
  ↓
Step Functions orchestrates:
  1. Duplicate Check Lambda (SHA-256 hash)
     ├─ If duplicate → Store Metadata Lambda → DynamoDB → Done
     └─ If new → Continue
  2. Textract Start Lambda (async job)
  3. Wait 10 seconds
  4. Textract Status Lambda (poll until complete)
  5. Comprehend Analyze Lambda (language, entities, phrases)
  6. Bedrock Summarize Lambda (Claude Sonnet 3)
  7. Store Metadata Lambda → DynamoDB
  ↓
GET /search → Search Lambda → Query DynamoDB → Return results
  ↓
React Dashboard displays processed documents
```

**Error Handling:**
- Each Lambda has 6 retry attempts (exponential backoff)
- Failed jobs → SQS DLQ → CloudWatch Alarm → SNS notification

**For detailed architecture diagrams and step-by-step workflow, see [ARCHITECTURE.md](ARCHITECTURE.md)**

---

## 🚀 Quick Start

### Prerequisites

- **AWS Account** with Bedrock model access (see below)
- **AWS CLI** v2.x configured with credentials
- **Node.js** v20.x or higher
- **AWS CDK** v2.x (`npm install -g aws-cdk`)
- **Docker Desktop** running (for Lambda bundling)

### Enable Amazon Bedrock Models

1. Go to [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Click **Model access** (left sidebar)
3. Click **Manage model access**
4. Enable **Anthropic Claude Sonnet 3** (`anthropic.claude-3-sonnet-20240229-v1:0`)
5. Wait for status: "Access granted" (may take 1-2 minutes)

### Deploy Stack

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
cdk deploy SimplifiedDocProcessorStackV3 --require-approval never
```

**Deployment time:** ~8-12 minutes

### Post-Deployment

After deployment, note these outputs:

| Output | Description |
|--------|-------------|
| `DocumentsBucketName` | S3 bucket for document uploads |
| `APIEndpoint` | API Gateway base URL |
| `CloudFrontURL` | Frontend application URL |
| `UserPoolId` | Cognito User Pool ID |
| `UserPoolClientId` | Cognito Client ID for frontend |
| `CognitoDomain` | Cognito OAuth domain |
| `MetadataTableName` | DynamoDB metadata table name |
| `DashboardName` | CloudWatch dashboard name |
| `DLQQueueUrl` | Dead letter queue URL |
| `PrimaryRegion` | Primary region (us-west-2) |
| `DRRegion` | DR region (us-east-2) |

---

## 👤 Create Test User

```bash
# Get User Pool ID from deployment outputs
USER_POOL_ID="us-west-2_xxxxxxxx"

# Create admin user
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --password "SecurePass123!" \
  --permanent
```

**Password Requirements:** Min 8 chars, uppercase, lowercase, numbers

---

## 📤 Upload Documents

### Via React Frontend (Recommended)

1. Open CloudFront URL in browser
2. Sign in with Cognito credentials
3. Click "Upload" and select document
4. Processing starts automatically
5. View results in dashboard

### Via API (Programmatic)

```bash
# Get API endpoint and authenticate
API_ENDPOINT="https://xxxxx.execute-api.us-west-2.amazonaws.com/prod"

# Get Cognito token (requires aws-cli and jq)
USER_POOL_ID="us-west-2_xxxxxxxx"
CLIENT_ID="xxxxxxxxxxxxxxxxxxxxx"

TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id $CLIENT_ID \
  --auth-parameters USERNAME=admin@example.com,PASSWORD=SecurePass123! \
  --query 'AuthenticationResult.IdToken' \
  --output text)

# Request presigned upload URL
curl -X POST $API_ENDPOINT/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "document.pdf",
    "fileSize": 1234567,
    "contentType": "application/pdf"
  }'

# Response: { "presignedUrl": "https://...", "documentId": "...", "expiresIn": 300 }

# Upload file using presigned URL
curl -X PUT "PRESIGNED_URL" \
  --upload-file document.pdf \
  -H "Content-Type: application/pdf"
```

### Supported Formats

- **PDF** (including scanned documents)
- **Images:** PNG, JPG, JPEG, TIFF
- **Max file size:** 500 MB (Textract limit)

---

## 🔍 Search Documents

### Via React Frontend

1. Sign in to CloudFront URL
2. Use search bar to filter by:
   - Language
   - Date range
   - Processing status
   - Keywords (searches metadata, not full-text)

### Via API

```bash
# Search by language
curl -G $API_ENDPOINT/search \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "language=en" \
  --data-urlencode "limit=10"

# Search by date range
curl -G $API_ENDPOINT/search \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "fromDate=2025-01-01" \
  --data-urlencode "toDate=2025-12-31"

# Get specific document metadata
curl $API_ENDPOINT/metadata/doc-12345 \
  -H "Authorization: Bearer $TOKEN"

# Health check (no auth required)
curl $API_ENDPOINT/health
```

**Response Format:**
```json
{
  "documents": [
    {
      "documentId": "bucket/key",
      "processingDate": "2025-11-12T10:30:00Z",
      "language": "en",
      "summary": "2-3 sentence AI-generated summary",
      "entities": ["Entity1", "Entity2"],
      "keyPhrases": ["phrase 1", "phrase 2"],
      "status": "PROCESSED",
      "fullTextLength": 5420
    }
  ],
  "count": 1,
  "nextToken": null
}
```

---

## 📊 Monitor Processing

### CloudWatch Dashboard

1. Go to [CloudWatch Console](https://console.aws.amazon.com/cloudwatch/)
2. Navigate to **Dashboards**
3. Open: `doc-processor-metrics-{region}`

**Metrics shown:**
- Step Functions executions (succeeded/failed)
- DLQ message depth
- API Gateway requests (total, 4XX, 5XX errors)

### Check for Failures

```bash
# Get DLQ URL from deployment outputs
DLQ_URL="https://sqs.us-west-2.amazonaws.com/xxxxx/doc-processing-dlq"

# Check for failed messages
aws sqs receive-message \
  --queue-url $DLQ_URL \
  --max-number-of-messages 10

# If messages found, check error details
aws sqs get-queue-attributes \
  --queue-url $DLQ_URL \
  --attribute-names ApproximateNumberOfMessages
```

### View Logs

```bash
# Step Functions execution logs
aws logs tail /aws/states/doc-processing-us-west-2 --follow

# Individual Lambda logs
aws logs tail /aws/lambda/doc-duplicate-check-us-west-2 --follow
aws logs tail /aws/lambda/doc-textract-start-us-west-2 --follow
aws logs tail /aws/lambda/doc-comprehend-us-west-2 --follow
aws logs tail /aws/lambda/doc-bedrock-us-west-2 --follow

# API logs
aws logs tail /aws/lambda/doc-upload-us-west-2 --follow
aws logs tail /aws/lambda/doc-search-us-west-2 --follow
```

---

## 🔒 Security

**Encryption:**
- ✅ S3 documents encrypted with KMS (customer-managed key, auto-rotation)
- ✅ S3 frontend encrypted with KMS
- ✅ DynamoDB encrypted (AWS-managed keys)
- ✅ SQS DLQ encrypted with KMS
- ✅ TLS 1.2+ for all data in transit (CloudFront, API Gateway)

**Authentication:**
- ✅ Cognito User Pool (admin-create-only, no self-registration)
- ✅ OAuth 2.0 authorization code grant
- ✅ Password policy: Min 8 chars, uppercase, lowercase, numbers
- ✅ MFA optional (recommended for production)

**Access Control:**
- ✅ IAM roles with least privilege for all Lambda functions
- ✅ S3 bucket policies: Block all public access
- ✅ S3 bucket policies: Enforce SSL/TLS
- ✅ API Gateway throttling: 100 req/s, 200 burst
- ✅ CloudFront Origin Access Control (OAC) for S3

**Audit & Monitoring:**
- ✅ CloudTrail enabled with file validation
- ✅ CloudWatch alarms for failures and DLQ messages
- ✅ SNS notifications for critical alerts
- ✅ Lambda logs retained for 90 days

**Textract Security:**
- ✅ Service role with minimal S3 permissions
- ✅ KMS key grants for Textract to decrypt S3 objects

**For detailed security architecture, see [ARCHITECTURE.md](ARCHITECTURE.md#security-architecture)**

---

## 🌍 Disaster Recovery

**What's Replicated:**
- ✅ DynamoDB Global Tables (3 tables) → us-east-2
  - Sub-second replication latency
  - Active-active (read/write in both regions)
  - Deletion protection enabled in DR region

**What's NOT Replicated:**
- ❌ S3 documents (no cross-region replication)
- ❌ Lambda functions (would need manual deployment)
- ❌ Step Functions (would need manual deployment)
- ❌ API Gateway (would need manual deployment)
- ❌ Cognito User Pool (region-specific, users need recreating)

**Recovery Metrics:**
- **RPO (Data):** <1 second (DynamoDB only)
- **RPO (Documents):** Complete loss (S3 not replicated)
- **RTO:** 2-4 hours (manual stack deployment to us-east-2)

**Failover Procedure:**
1. Verify DR data: `aws dynamodb scan --table-name document-metadata --region us-east-2`
2. Deploy stack to us-east-2: `cdk deploy SimplifiedDocProcessorStackV3 --region us-east-2`
3. Update frontend config to use new API Gateway
4. Recreate Cognito users

**For detailed DR architecture, see [ARCHITECTURE.md](ARCHITECTURE.md#disaster-recovery)**

---

## 💰 Cost Estimate

**Moderate Usage:** 1,000 documents/month, 100GB storage, average 5 pages/document

| Service | Monthly Cost | % of Total |
|---------|--------------|------------|
| **Bedrock** (Claude Sonnet 3, 1K requests) | $30.00 | 49% |
| **Textract** (5,000 pages) | $7.50 | 12% |
| **CloudWatch** (10GB logs, 10 alarms) | $5.00 | 8% |
| **CloudFront** (50GB transfer) | $4.25 | 7% |
| **DynamoDB** (10K writes, 20K reads + replication) | $4.25 | 7% |
| **S3** (100GB storage + requests) | $2.30 | 4% |
| **KMS** (1 key, 10K API calls) | $2.00 | 3% |
| **Comprehend** (15K units) | $1.50 | 2% |
| **Lambda** (8K invocations, ~100 GB-seconds) | $0.36 | 1% |
| **Step Functions** (1K executions, 10 steps avg) | $0.25 | <1% |
| **API Gateway** (10K requests) | $0.35 | <1% |
| **SNS, SQS, CloudTrail, Cognito** | $3.06 | 5% |
| **Total** | **~$60.77** | **100%** |

**Cost Optimization Tips:**
1. **Reduce Bedrock costs (49%):** Use Claude Haiku for simpler docs, shorten prompts
2. **Reduce Textract costs (12%):** Skip OCR for text-based PDFs, detect duplicates earlier
3. **Optimize DynamoDB:** Switch to provisioned capacity if usage is predictable (save 50-75%)
4. **Reduce CloudWatch costs:** Lower log retention from 90 days to 30 days
5. **S3 lifecycle:** Already configured (30d → IA, 90d → Glacier, 365d → Deep Archive)

**Free Tier (First 12 Months):**
- Lambda: 1M requests/month free
- DynamoDB: 25 GB + 25 read/write units free
- S3: 5 GB + 20K GET + 2K PUT free
- Cognito: 50K MAU free
- **Potential savings:** $10-15/month

**For detailed cost breakdown, see [ARCHITECTURE.md](ARCHITECTURE.md#cost-optimization)**

---

## 🛠️ Configuration

### Change Bedrock Model

Edit `backend/lib/intelligent-doc-processor-stack.ts`:

```typescript
const bedrockSummarize = new lambda_nodejs.NodejsFunction(this, "BedrockSummarize", {
  environment: {
    BEDROCK_MODEL_ID: "anthropic.claude-3-haiku-20240307-v1:0", // Change to Haiku (cheaper)
    // Or: "anthropic.claude-3-opus-20240229-v1:0" (more powerful)
  },
});
```

**Model Comparison:**
- **Claude Haiku:** $0.25/$1.25 per 1M input/output tokens (cheapest, fast)
- **Claude Sonnet:** $3.00/$15.00 per 1M tokens (balanced, default)
- **Claude Opus:** $15.00/$75.00 per 1M tokens (most powerful, expensive)

### Adjust S3 Lifecycle

Edit `backend/lib/intelligent-doc-processor-stack.ts`:

```typescript
docsBucket.addLifecycleRule({
  transitions: [
    { storageClass: s3.StorageClass.INTELLIGENT_TIERING, transitionAfter: Duration.days(30) },
    { storageClass: s3.StorageClass.GLACIER, transitionAfter: Duration.days(90) },
    { storageClass: s3.StorageClass.DEEP_ARCHIVE, transitionAfter: Duration.days(365) },
  ],
});
```

### Enable MFA

```bash
# Enable MFA for Cognito User Pool
aws cognito-idp set-user-pool-mfa-config \
  --user-pool-id $USER_POOL_ID \
  --mfa-configuration OPTIONAL \
  --software-token-mfa-configuration Enabled=true
```

---

## 🧹 Cleanup

### Delete Stack

```bash
cd backend
cdk destroy SimplifiedDocProcessorStackV3
```

**Note:** Resources with `RemovalPolicy.RETAIN` will persist:
- KMS key (must be manually scheduled for deletion)
- CloudTrail trail
- S3 buckets (must be emptied first)

### Force Delete S3 Buckets

```bash
# Get bucket names from outputs
DOCS_BUCKET="doc-processor-documents-xxxxx"
FRONTEND_BUCKET="doc-processor-frontend-xxxxx"

# Empty documents bucket (including versions)
aws s3api list-object-versions --bucket $DOCS_BUCKET \
  --query 'Versions[].{Key:Key,VersionId:VersionId}' \
  --output json | \
  jq -r '.[] | "--key \(.Key) --version-id \(.VersionId)"' | \
  xargs -n 3 aws s3api delete-object --bucket $DOCS_BUCKET

# Delete buckets
aws s3 rb s3://$DOCS_BUCKET --force
aws s3 rb s3://$FRONTEND_BUCKET --force

# Schedule KMS key deletion (7-day minimum waiting period)
KMS_KEY_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
aws kms schedule-key-deletion --key-id $KMS_KEY_ID --pending-window-in-days 7
```

---

## 🐛 Troubleshooting

### Documents Not Processing

**Check:**
1. EventBridge rule is enabled: `aws events describe-rule --name DocumentProcessingRule`
2. Step Functions state machine exists: `aws stepfunctions list-state-machines`
3. Check DLQ for error messages: `aws sqs receive-message --queue-url $DLQ_URL`
4. View Step Functions execution: CloudWatch → Step Functions → Select execution → Execution details

**Logs:**
```bash
# Step Functions
aws logs tail /aws/states/doc-processing-us-west-2 --follow

# Specific Lambda
aws logs tail /aws/lambda/doc-textract-start-us-west-2 --follow
```

### API Returns 401 Unauthorized

**Cause:** Invalid or expired Cognito token

**Solution:**
1. Verify token is valid: Check expiration (ID tokens expire in 1 hour)
2. Re-authenticate to get new token
3. Ensure `Authorization: Bearer <token>` header is set correctly

### API Returns 403 Forbidden

**Cause:** User not authorized or throttling

**Solution:**
1. Verify user exists in Cognito User Pool
2. Check API Gateway throttling limits (100 req/s)
3. Check CloudWatch API Gateway logs for specific error

### Textract Job Fails

**Common causes:**
- File too large (>500 MB)
- Unsupported file format
- Corrupted file
- KMS permissions issue (Textract can't decrypt S3 object)

**Check:**
```bash
# View Textract Start Lambda logs
aws logs tail /aws/lambda/doc-textract-start-us-west-2 --follow

# Check KMS key policy allows Textract service
aws kms get-key-policy --key-id $KMS_KEY_ID --policy-name default
```

### High Costs

**Check:**
1. CloudWatch → Billing → Cost Explorer
2. Filter by service to identify cost drivers
3. Common culprits:
   - Bedrock: Too many invocations or long prompts
   - Textract: High page count
   - DynamoDB: Unexpected read/write patterns
   - CloudWatch: Excessive logging

**Solutions:**
- Review cost optimization section above
- Consider switching to Claude Haiku
- Reduce CloudWatch log retention
- Implement caching for duplicate documents

**For more troubleshooting, see [ARCHITECTURE.md](ARCHITECTURE.md)**

---

## 📖 Additional Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** ⭐ - Complete technical documentation
  - Full system architecture with Mermaid diagrams
  - Step Functions workflow (state machine definition)
  - API architecture and authentication flow
  - DynamoDB schema with GSI details
  - Security architecture (KMS, IAM, Cognito)
  - Monitoring setup (CloudWatch, SNS, DLQ)
  - Disaster recovery (multi-region DynamoDB)
  - Cost optimization strategies

- **[AWS_DIAGRAM_CREATION_GUIDE.md](AWS_DIAGRAM_CREATION_GUIDE.md)** 🎨 - Create professional AWS diagrams
  - Tool setup (diagrams.net / draw.io)
  - AWS icon library (24 required icons)
  - Step-by-step component placement (9 detailed steps)
  - Connection guidelines (line types, labels)
  - Official AWS styling and colors
  - Estimated time: 90-120 minutes

- **[DIAGRAM_QUICK_REFERENCE.md](DIAGRAM_QUICK_REFERENCE.md)** 📋 - Printable checklist
  - 30 components with checkboxes
  - 28 connections with checkboxes
  - Color code reference (hex values)
  - Line style reference
  - Common mistakes to avoid

- **[DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)** 📖 - Central documentation guide
  - Overview of all documentation files
  - Quick start workflows for different roles
  - Documentation maintenance guidelines
  - Version control recommendations

- **[images/COMPONENT_SPECIFICATIONS.md](images/COMPONENT_SPECIFICATIONS.md)** 📊 - Detailed component specs
  - Lambda function specifications (timeout, memory, I/O)
  - DynamoDB table schemas (keys, GSIs, attributes)
  - AI service configurations (Textract, Comprehend, Bedrock)
  - Step Functions state machine details
  - API Gateway endpoint specifications
  - Cost breakdown by service

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. **Update documentation** when changing infrastructure
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

**When updating infrastructure:**
- Update `backend/lib/intelligent-doc-processor-stack.ts` first
- Deploy and test changes
- Update `ARCHITECTURE.md` to reflect new resources
- Update `COMPONENT_SPECIFICATIONS.md` tables
- Update diagram guides if components added/removed
- Update this README if user-facing changes

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- **Repository:** https://github.com/annabook21/IntelligentDoc_Processor
- **AWS Bedrock Documentation:** https://docs.aws.amazon.com/bedrock/
- **AWS Step Functions Documentation:** https://docs.aws.amazon.com/step-functions/
- **AWS CDK Documentation:** https://docs.aws.amazon.com/cdk/
- **Amazon Textract Documentation:** https://docs.aws.amazon.com/textract/
- **Amazon Comprehend Documentation:** https://docs.aws.amazon.com/comprehend/

---

## ⚠️ Important: What This Stack Actually Deploys

**✅ What's Implemented:**
- Step Functions state machine orchestrating 6 processing Lambdas
- 8 Lambda functions total (2 API + 6 processing)
- Cognito User Pool for authentication (admin-create-only)
- CloudFront + S3 frontend hosting (React app)
- DynamoDB Global Tables with DR replication to us-east-2
- Duplicate detection via SHA-256 hashing
- KMS customer-managed encryption key
- CloudWatch monitoring, alarms, and dashboard
- SNS notifications for failures
- SQS Dead Letter Queue

**❌ What's NOT Implemented:**
- Bedrock Flows (uses Step Functions instead)
- OpenSearch (no full-text search service)
- VPC (all serverless services)
- S3 cross-region replication (only DynamoDB replicated)
- WAF on API Gateway or CloudFront
- Self-service user registration (Cognito admin-create-only)

---

**Questions?** Open an issue or see the [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md).

**Document Version:** 1.0  
**Stack:** SimplifiedDocProcessorStackV3  
**Last Updated:** November 12, 2025

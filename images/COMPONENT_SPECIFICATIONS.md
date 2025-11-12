# AWS Architecture Diagram - Component Specifications
## SimplifiedDocProcessorStackV3

**Use this table as a reference when building your diagram**

---

## Lambda Functions (8 Total)

| Name | Resource ID | Timeout | Memory | Purpose | Inputs | Outputs | Error Handling |
|------|------------|---------|---------|---------|--------|---------|----------------|
| **Upload Handler** | doc-upload-us-west-2 | 30s | 128MB | Generate presigned S3 URLs | fileName, fileSize, contentType | presignedUrl, documentId, expiresIn | DLQ, 3 retries |
| **Search Handler** | doc-search-us-west-2 | 30s | 256MB | Query documents by filters | filters, pagination | documents[], count, nextToken | DLQ, 3 retries |
| **Duplicate Check** | doc-duplicate-check-us-west-2 | 60s | 256MB | Detect duplicates via SHA-256 | s3Bucket, s3Key | isDuplicate, contentHash, originalDocId | DLQ, 6 retries |
| **Textract Start** | doc-textract-start-us-west-2 | 30s | 128MB | Start async Textract job | s3Bucket, s3Key, documentId | jobId, status | DLQ, 6 retries |
| **Textract Status** | doc-textract-status-us-west-2 | 30s | 256MB | Poll Textract job status | jobId | status, text, pageCount | DLQ, 6 retries |
| **Comprehend Analyze** | doc-comprehend-us-west-2 | 30s | 256MB | NLP: language, entities, phrases | text | language, entities[], keyPhrases[] | DLQ, 6 retries |
| **Bedrock Summarize** | doc-bedrock-us-west-2 | 45s | 512MB | AI summarization + insights | text, metadata | summary, insights, structuredData | DLQ, 6 retries |
| **Store Metadata** | doc-store-us-west-2 | 30s | 128MB | Write metadata to DynamoDB | all processing results | documentId, status | DLQ, 6 retries |

---

## DynamoDB Tables (3 Global Tables)

| Table | PK | SK | GSI | Attributes | Purpose | Size Estimate |
|-------|----|----|-----|------------|---------|---------------|
| **document-metadata** | documentId | processingDate | LanguageIndex (language + processingDate) | s3Bucket, s3Key, language, entities, keyPhrases, text, fullTextLength, summary, insights, structuredData, status, duplicateOf, contentHash | Store processed document metadata | ~5KB/doc |
| **document-names** | documentId | - | S3KeyIndex (s3Key) | s3Key, originalFileName, uploadedAt, uploadedBy | Map doc IDs to filenames | ~500B/doc |
| **document-hash-registry** | contentHash | - | - | firstDocumentId, firstSeen, latestDocumentId, lastSeen, occurrences | Duplicate detection | ~300B/hash |

**Configuration:**
- Billing: Pay-per-request (on-demand)
- Replication: us-west-2 → us-east-2
- PITR: Enabled
- Deletion Protection: Enabled (DR region only)
- Stream: NEW_AND_OLD_IMAGES

---

## AI Services

| Service | API | Model/Config | Input Limit | Output | Cost (per 1K) |
|---------|-----|--------------|-------------|--------|---------------|
| **Amazon Textract** | StartDocumentTextDetection, GetDocumentTextDetection | Standard OCR | 500MB file, async | Extracted text, bounding boxes | $1.50/1K pages |
| **Amazon Comprehend** | DetectDominantLanguage, DetectEntities, DetectKeyPhrases | Batch mode | 100KB per API call | Language code, entities, key phrases | $0.50/3K units |
| **Amazon Bedrock** | InvokeModel | Claude Sonnet 3 (anthropic.claude-3-sonnet-20240229-v1:0) | 200K tokens input | Summary (2-3 sentences), key insights, structured data | $3.00 per 1M input tokens, $15.00 per 1M output tokens |

---

## Step Functions State Machine

| Property | Value |
|----------|-------|
| **Name** | doc-processing-us-west-2 |
| **Type** | Standard |
| **Timeout** | 30 minutes (1800 seconds) |
| **X-Ray Tracing** | Enabled |
| **Logging** | ALL (execution history, input/output) |
| **Retry Config** | 6 attempts, 2x backoff, 2s interval |
| **States** | 10 (PrepareInput, CheckDuplicate, IsDuplicateChoice, StartTextract, WaitForTextract, GetTextractStatus, TextractStatusChoice, AnalyzeComprehend, SummarizeBedrock, StoreMetadata) |
| **Error Handling** | Lambda errors → DLQ, SNS notification |

**Execution Flow:**
1. PrepareInput → 2. CheckDuplicate → 3. Choice (if duplicate → 10, if new → 4)
4. StartTextract → 5. Wait 10s → 6. GetTextractStatus → 7. Choice (if IN_PROGRESS → 5, if SUCCEEDED → 8)
8. AnalyzeComprehend → 9. SummarizeBedrock → 10. StoreMetadata → End

---

## S3 Buckets (2)

| Bucket | Purpose | Encryption | Versioning | Lifecycle | Public Access |
|--------|---------|------------|------------|-----------|---------------|
| **Documents Bucket** | Store uploaded documents (PDF, DOCX, images) | KMS (customer managed key) | Enabled | 30d → IA, 90d → Glacier, 365d → Deep Archive | Blocked |
| **Frontend Bucket** | Host React SPA (index.html, bundle.js, assets) | KMS (customer managed key) | Disabled | None | Blocked (CloudFront OAC only) |

**Documents Bucket Config:**
- EventBridge: Enabled (Object Created events)
- Object Lock: Not enabled
- Versioning: Enabled (for accidental deletes)
- Intelligent-Tiering: Recommended for cost optimization

---

## API Gateway

| Endpoint | Method | Auth Type | Lambda Target | Request Schema | Response | Throttling |
|----------|--------|-----------|---------------|----------------|----------|------------|
| `/upload` | POST | Cognito | Upload Handler | `{ fileName, fileSize, contentType }` | `{ presignedUrl, documentId, expiresIn }` | 100 req/s, 200 burst |
| `/search` | GET | Cognito | Search Handler | Query params: `language`, `status`, `fromDate`, `toDate`, `limit`, `nextToken` | `{ documents[], count, nextToken }` | 100 req/s, 200 burst |
| `/search` | POST | Cognito | Search Handler | `{ filters: {...}, pagination: {...} }` | `{ documents[], count, nextToken }` | 100 req/s, 200 burst |
| `/metadata/{documentId}` | GET | Cognito | Search Handler | Path param: `documentId` | `{ document: {...} }` | 100 req/s, 200 burst |
| `/health` | GET | IAM | Search Handler | None | `{ status: "healthy", timestamp }` | 1000 req/s |

**CORS Configuration:**
- Allow-Origin: CloudFront distribution URL
- Allow-Methods: GET, POST, OPTIONS
- Allow-Headers: Content-Type, Authorization
- Max-Age: 3600

---

## Cognito User Pool

| Property | Value |
|----------|-------|
| **Pool Name** | doc-processor-users-us-west-2 |
| **Domain** | idp-901916-uswe.auth.us-west-2.amazoncognito.com |
| **Client ID** | doc-processor-frontend-us-west-2 |
| **Sign-up** | Admin create only (no self-registration) |
| **Password Policy** | Min 8 chars, uppercase, lowercase, numbers required |
| **MFA** | Optional (recommended) |
| **OAuth Flows** | Authorization code grant |
| **OAuth Scopes** | email, openid, profile |
| **Callback URLs** | CloudFront URL + /callback |
| **Logout URLs** | CloudFront URL |
| **Token Validity** | ID: 1 hour, Access: 1 hour, Refresh: 30 days |

---

## CloudFront Distribution

| Property | Value |
|----------|-------|
| **Origin** | S3 Frontend Bucket |
| **Origin Access** | Origin Access Control (OAC) |
| **Price Class** | PriceClass_100 (US, Canada, Europe) |
| **Compression** | Enabled (gzip, brotli) |
| **HTTP Versions** | HTTP/2, HTTP/3 |
| **IPv6** | Enabled |
| **Default Root Object** | index.html |
| **Custom Error Responses** | 404 → /index.html (200), 403 → /index.html (200) |
| **Cache Policy** | CachingOptimized |
| **SSL/TLS** | TLS 1.2+ |
| **WAF** | Not configured (consider adding) |

---

## Security Components

| Component | Configuration | Purpose |
|-----------|---------------|---------|
| **KMS Key** | Customer managed, auto-rotation enabled, removal policy: RETAIN | Encrypt S3 buckets, SQS DLQ |
| **CloudTrail** | Single trail, S3 logging, file validation enabled | Audit all API calls |
| **IAM Roles** | 8 Lambda execution roles, 1 Step Functions role, 1 EventBridge role, 1 Textract service role | Least privilege access |
| **S3 Bucket Policies** | Block all public access, enforce SSL/TLS, restrict to specific IAM roles | Prevent unauthorized access |
| **API Gateway** | Cognito authorizer, request validation, throttling | Secure API access |

---

## Monitoring & Alerting

| Component | Configuration | Purpose |
|-----------|---------------|---------|
| **CloudWatch Logs** | 8 Lambda log groups (90-day retention), 1 Step Functions log group (30-day retention), 1 API Gateway log group (90-day retention) | Debugging and troubleshooting |
| **CloudWatch Dashboard** | 3 widgets: Step Functions metrics, DLQ metrics, API Gateway metrics | Real-time monitoring |
| **CloudWatch Alarm 1** | DLQ Messages: Threshold ≥1 message, 1-minute period, 1 evaluation period | Detect failed jobs |
| **CloudWatch Alarm 2** | Workflow Failures: Threshold ≥1 failure, 5-minute period, 1 evaluation period | Detect Step Functions failures |
| **SNS Topic** | doc-processing-alerts-us-west-2, email/SMS subscribers | Alert notifications |
| **SQS DLQ** | doc-processing-dlq-us-west-2, 14-day retention, KMS encrypted | Failed message storage |

---

## Network & EventBridge

| Component | Configuration | Purpose |
|-----------|---------------|---------|
| **EventBridge Rule** | Source: `aws.s3`, Event: `Object Created`, Target: Step Functions | Trigger processing on S3 upload |
| **VPC** | Not used (all serverless services in AWS-managed VPCs) | N/A |
| **VPC Endpoints** | Not configured | Could reduce NAT Gateway costs if Lambda needs private access |

---

## Disaster Recovery

| Component | Primary Region | DR Region | Replication Latency | Recovery Method |
|-----------|----------------|-----------|---------------------|-----------------|
| **DynamoDB Metadata** | us-west-2 (RW) | us-east-2 (RW) | <1 second | Automatic, active-active |
| **DynamoDB Names** | us-west-2 (RW) | us-east-2 (RW) | <1 second | Automatic, active-active |
| **DynamoDB Hash Registry** | us-west-2 (RW) | us-east-2 (RW) | <1 second | Automatic, active-active |
| **S3 Documents** | us-west-2 | None | N/A | **NOT REPLICATED** |
| **Lambda Functions** | us-west-2 | None | N/A | Manual deployment |
| **Step Functions** | us-west-2 | None | N/A | Manual deployment |
| **API Gateway** | us-west-2 | None | N/A | Manual deployment |
| **Cognito User Pool** | us-west-2 | None | N/A | Manual user recreation |

**RPO (Data):** <1 second (DynamoDB only)  
**RTO:** 2-4 hours (manual stack deployment)

---

## Resource Tagging Strategy

| Tag Key | Example Value | Purpose |
|---------|---------------|---------|
| `Project` | IntelligentDocProcessor | Group all resources |
| `Environment` | Production | Distinguish dev/staging/prod |
| `CostCenter` | Engineering | Billing allocation |
| `Owner` | platform-team@example.com | Contact for issues |
| `Stack` | SimplifiedDocProcessorStackV3 | CloudFormation stack name |

---

## Estimated Costs (Moderate Usage: 1,000 docs/month)

| Component | Monthly Cost | % of Total |
|-----------|--------------|------------|
| Bedrock (Claude Sonnet 3) | $30.00 | 49% |
| Textract (5,000 pages) | $7.50 | 12% |
| CloudWatch (10GB logs) | $5.00 | 8% |
| CloudFront (50GB transfer) | $4.25 | 7% |
| DynamoDB (10K writes, 20K reads, replication) | $4.25 | 7% |
| S3 (100GB storage) | $2.30 | 4% |
| KMS (1 key, 10K calls) | $2.00 | 3% |
| Comprehend (15K units) | $1.50 | 2% |
| Other (Lambda, API GW, SNS, SQS, etc.) | $4.00 | 8% |
| **Total** | **~$60.77** | **100%** |

---

**Document Version:** 1.0  
**Stack:** SimplifiedDocProcessorStackV3  
**Last Updated:** November 12, 2025

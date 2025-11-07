# Multi-Region Architecture Diagram

## Visual Architecture

### Complete System with Disaster Recovery

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                               GLOBAL LAYER                                         │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  👤 Users (Worldwide)                                                              │
│     │                                                                              │
│     │ HTTPS                                                                        │
│     ↓                                                                              │
│  ┌────────────────────────────────────────────┐                                   │
│  │   Amazon CloudFront (Global CDN)           │                                   │
│  │   Distribution ID: EG3VA946DD39Z           │                                   │
│  │   Domain: d3ozz2yllseyw8.cloudfront.net    │                                   │
│  │   ✓ SSL/TLS Termination                    │                                   │
│  │   ✓ Edge Caching                           │                                   │
│  │   ✓ DDoS Protection                        │                                   │
│  └────────────────────────────────────────────┘                                   │
│     │                                                                              │
│     │ Origin Request                                                               │
│     ↓                                                                              │
└────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │
                                    ↓
┌────────────────────────────────────────────────────────────────────────────────────┐
│                         PRIMARY REGION (us-west-2)                                 │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │                         FRONTEND & AUTH                                  │     │
│  │                                                                           │     │
│  │  📦 S3 Frontend Bucket                                                   │     │
│  │     doc-processor-frontend-5b59e817                                      │     │
│  │     ├── index.html                                                       │     │
│  │     ├── config.json (Runtime configuration)                              │     │
│  │     └── static/ (JS/CSS assets)                                          │     │
│  │                                                                           │     │
│  │  👥 Amazon Cognito User Pool                                             │     │
│  │     ID: us-west-2_dFwXN1Q3G                                              │     │
│  │     Domain: idp-901916-uswe.auth.us-west-2.amazoncognito.com            │     │
│  │     Client ID: 2m6v77c66qhj2q7i9eib2kpgt2                                │     │
│  │     ├── OAuth 2.0 Hosted UI                                              │     │
│  │     ├── Password Policy Enforced                                         │     │
│  │     └── Email Verification                                               │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│                                    │                                              │
│                                    │ Auth Token (JWT)                             │
│                                    ↓                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │                          API LAYER                                       │     │
│  │                                                                           │     │
│  │  🌐 Amazon API Gateway (REST)                                            │     │
│  │     Endpoint: l0sgxyjmic.execute-api.us-west-2.amazonaws.com/prod       │     │
│  │     ├── /upload   (POST) - Upload documents                              │     │
│  │     ├── /search   (GET)  - Query documents                               │     │
│  │     ├── /metadata (GET)  - Document details                              │     │
│  │     └── /health   (GET)  - Health check                                  │     │
│  │                                                                           │     │
│  │     Cognito Authorizer: Validates JWT tokens                             │     │
│  │     CORS: Enabled for CloudFront origin                                  │     │
│  │     Throttling: 100 req/s steady, 200 burst                              │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│            │                                      │                                │
│            │ /upload                              │ /search, /metadata             │
│            ↓                                      ↓                                │
│  ┌─────────────────────┐              ┌──────────────────────┐                   │
│  │  λ upload-handler   │              │  λ search-handler    │                   │
│  │  Generate S3        │              │  Query DynamoDB      │                   │
│  │  Presigned URLs     │              │  Return results      │                   │
│  └─────────────────────┘              └──────────────────────┘                   │
│            │                                      │                                │
│            │ PUT Document                         │ Query                          │
│            ↓                                      ↓                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │                      STORAGE LAYER                                       │     │
│  │                                                                           │     │
│  │  📦 S3 Documents Bucket                                                  │     │
│  │     intelligent-docs-232894901916-uswest2-38c413ba                       │     │
│  │     ├── uploads/ (user uploads)                                          │     │
│  │     ├── processed/ (Textract outputs)                                    │     │
│  │     ├── KMS Encryption                                                   │     │
│  │     └── Lifecycle Rules:                                                 │     │
│  │         - Day 0-30: Standard                                             │     │
│  │         - Day 30-90: Intelligent-Tiering                                 │     │
│  │         - Day 90-365: Glacier                                            │     │
│  │         - Day 365+: Deep Archive                                         │     │
│  │                                                                           │     │
│  │  ⚠️  NOT replicated to DR region (manual CRR recommended)                │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│            │                                                                       │
│            │ S3 ObjectCreated Event                                               │
│            ↓                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │                    ORCHESTRATION LAYER                                   │     │
│  │                                                                           │     │
│  │  📋 Amazon EventBridge                                                   │     │
│  │     Rule: S3 → Step Functions trigger                                    │     │
│  │     Pattern: ObjectCreated in /uploads/*                                 │     │
│  │            ↓                                                              │     │
│  │  🔄 AWS Step Functions State Machine                                     │     │
│  │     Name: doc-processing-us-west-2                                       │     │
│  │     Timeout: 30 minutes                                                  │     │
│  │     Logging: CloudWatch (full trace)                                     │     │
│  │     DLQ: SQS queue for failed executions                                 │     │
│  │                                                                           │     │
│  │     Workflow:                                                            │     │
│  │     1. PrepareInput        → Parse S3 event                              │     │
│  │     2. λ CheckDuplicate    → SHA-256 hash lookup                         │     │
│  │     3. Choice              → Duplicate? Yes → StoreMetadata              │     │
│  │                            → Duplicate? No  → Continue                   │     │
│  │     4. λ TextractStart     → Start async Textract job                    │     │
│  │     5. Wait                → 10 second pause                             │     │
│  │     6. λ TextractStatus    → Poll job, extract text                      │     │
│  │     7. λ ComprehendAnalyze → Language + Entities + Key Phrases           │     │
│  │     8. λ BedrockSummarize  → AI summary + insights                       │     │
│  │     9. λ StoreMetadata     → Save to DynamoDB                            │     │
│  │                                                                           │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│            │                                                                       │
│            │ Invoke AWS AI Services                                               │
│            ↓                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │                       AI SERVICES                                        │     │
│  │                                                                           │     │
│  │  🤖 Amazon Textract                                                      │     │
│  │     ├── Text extraction from PDFs/Images                                 │     │
│  │     ├── Table detection                                                  │     │
│  │     └── Form data extraction                                             │     │
│  │                                                                           │     │
│  │  🧠 Amazon Comprehend                                                    │     │
│  │     ├── Language detection (100+ languages)                              │     │
│  │     ├── Entity extraction (PERSON, LOCATION, ORG, DATE, etc.)           │     │
│  │     └── Key phrase extraction                                            │     │
│  │                                                                           │     │
│  │  🎨 Amazon Bedrock                                                       │     │
│  │     Model: anthropic.claude-sonnet-4-5-20250929-v1:0                     │     │
│  │     ├── Document summarization (2-3 sentences)                           │     │
│  │     ├── Key insights extraction                                          │     │
│  │     └── Structured data parsing                                          │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│                                    │                                              │
│                                    │ Store Results                                │
│                                    ↓                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │                   DATA STORAGE (PRIMARY)                                 │     │
│  │                                                                           │     │
│  │  🗄️  DynamoDB Global Tables                                              │     │
│  │                                                                           │     │
│  │  ┌─────────────────────────────────────────────────────────┐            │     │
│  │  │  document-metadata-uswest2-df3261d7                     │            │     │
│  │  │  ─────────────────────────────────────────────────────  │            │     │
│  │  │  PK: documentId (S3 key)                                │            │     │
│  │  │  SK: processingDate (timestamp)                         │            │     │
│  │  │  GSI: LanguageIndex (language + date)                   │            │     │
│  │  │                                                          │            │     │
│  │  │  Attributes:                                            │            │     │
│  │  │  ├── language: String (en, es, fr, etc.)                │            │     │
│  │  │  ├── entities: JSON (people, places, orgs)              │            │     │
│  │  │  ├── keyPhrases: JSON array                             │            │     │
│  │  │  ├── summary: String (AI-generated)                     │            │     │
│  │  │  ├── insights: String (key findings)                    │            │     │
│  │  │  ├── structuredData: JSON (dates, amounts, etc.)        │            │     │
│  │  │  ├── text: String (first 10k chars)                     │            │     │
│  │  │  ├── fullTextLength: Number                             │            │     │
│  │  │  ├── status: PROCESSED | DUPLICATE                      │            │     │
│  │  │  └── contentHash: String (SHA-256)                      │            │     │
│  │  │                                                          │            │     │
│  │  │  Capacity: On-Demand (auto-scaling)                     │            │     │
│  │  │  Encryption: AWS Managed KMS                            │            │     │
│  │  └─────────────────────────────────────────────────────────┘            │     │
│  │                             │                                            │     │
│  │                             │ Sub-second replication                     │     │
│  │                             ↓                                            │     │
│  │  ┌─────────────────────────────────────────────────────────┐            │     │
│  │  │  document-hash-registry-uswest2-b2e970e1                │            │     │
│  │  │  ─────────────────────────────────────────────────────  │            │     │
│  │  │  PK: contentHash (SHA-256)                              │            │     │
│  │  │  Attributes:                                            │            │     │
│  │  │  ├── firstDocumentId: String                            │            │     │
│  │  │  ├── firstSeen: Timestamp                               │            │     │
│  │  │  ├── latestDocumentId: String                           │            │     │
│  │  │  ├── lastSeen: Timestamp                                │            │     │
│  │  │  └── occurrences: Number                                │            │     │
│  │  └─────────────────────────────────────────────────────────┘            │     │
│  │                             │                                            │     │
│  │                             │ Sub-second replication                     │     │
│  │                             ↓                                            │     │
│  │  ┌─────────────────────────────────────────────────────────┐            │     │
│  │  │  document-names-uswest2-aa45fcc8                        │            │     │
│  │  │  (Document name registry for quick lookups)             │            │     │
│  │  └─────────────────────────────────────────────────────────┘            │     │
│  │                                                                           │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│                                    │                                              │
│                                    │ Bi-directional Replication (<1 sec)          │
│                                    ↓                                              │
└────────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ↓
┌────────────────────────────────────────────────────────────────────────────────────┐
│                        DR REGION (us-east-2)                                       │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  🗄️  DynamoDB Global Table Replicas (Read/Write Enabled)                          │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐                │
│  │  document-metadata (replica)                                 │                │
│  │  ─────────────────────────────────────────────────────────   │                │
│  │  ✅ Active Replica (Multi-Master)                            │                │
│  │  ✅ Automatic Replication                                    │                │
│  │  ✅ Deletion Protection ENABLED                              │                │
│  │  ✅ Point-in-Time Recovery (35 days)                         │                │
│  │  ✅ Same schema as primary                                   │                │
│  │                                                               │                │
│  │  Replication Lag: <1 second (typical)                        │                │
│  │  Consistency: Eventually consistent                          │                │
│  │  Conflict Resolution: Last-writer-wins                       │                │
│  └──────────────────────────────────────────────────────────────┘                │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐                │
│  │  document-hash-registry (replica)                            │                │
│  │  ✅ Deletion Protection ENABLED                              │                │
│  └──────────────────────────────────────────────────────────────┘                │
│                                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐                │
│  │  document-names (replica)                                    │                │
│  │  ✅ Deletion Protection ENABLED                              │                │
│  └──────────────────────────────────────────────────────────────┘                │
│                                                                                    │
│  ⚠️  No active processing resources (deploy on failover)                          │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────┐
│                        MONITORING & ALERTING (us-west-2)                           │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  📊 CloudWatch Dashboard: doc-processor-metrics-us-west-2-490d30ee                │
│     ├── Step Functions execution metrics                                          │
│     ├── Lambda invocation counts and errors                                       │
│     ├── API Gateway request/response metrics                                      │
│     ├── DynamoDB read/write capacity                                              │
│     └── Textract/Comprehend/Bedrock invocations                                   │
│                                                                                    │
│  🚨 CloudWatch Alarms                                                             │
│     ├── WorkflowFailureAlarm: >3 failures in 5 min → SNS                          │
│     └── DLQMessagesAlarm: ≥5 messages → SNS                                       │
│                                                                                    │
│  📬 Amazon SNS Topic                                                              │
│     arn:aws:sns:us-west-2:232894901916:doc-processing-alerts-*                    │
│     └── Email notifications on critical alerts                                    │
│                                                                                    │
│  ☠️  SQS Dead Letter Queue                                                        │
│     lambda-dlq-us-west-2-9bd30b83                                                 │
│     └── Failed Lambda invocations                                                 │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## Detailed Component Specifications

### Lambda Functions (8 total)

| Function | Runtime | Memory | Timeout | Purpose |
|----------|---------|--------|---------|---------|
| **upload-handler** | Node.js 20.x | 256MB | 30s | Generate S3 presigned URLs |
| **search-handler** | Node.js 20.x | 512MB | 30s | Query DynamoDB, return results |
| **check-duplicate** | Node.js 20.x | 256MB | 30s | Compute SHA-256, check hash registry |
| **textract-start** | Node.js 20.x | 256MB | 30s | Start async Textract job |
| **textract-status** | Node.js 20.x | 512MB | 5m | Poll Textract, extract text |
| **comprehend-analyze** | Node.js 20.x | 512MB | 5m | Detect language, entities, phrases |
| **bedrock-summarize** | Node.js 20.x | 1024MB | 5m | Generate AI summary/insights |
| **store-metadata** | Node.js 20.x | 256MB | 30s | Write results to DynamoDB |

**Common Configuration:**
- Environment encryption: KMS
- Log retention: 7 days
- Error handling: Retry 2x, then DLQ
- X-Ray tracing: Enabled

### Network Architecture

```
Internet (Users)
    │
    │ HTTPS (Port 443)
    ↓
CloudFront Edge Locations (Global)
    │
    │ Origin Protocol: HTTPS
    ↓
┌────────────────────────────────────────┐
│  us-west-2 (Primary)                   │
│  ┌──────────────────────────────────┐  │
│  │  S3 Frontend Bucket              │  │
│  │  (Private, OAC access only)      │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  API Gateway                     │  │
│  │  (Regional endpoint)             │  │
│  └──────────────────────────────────┘  │
│    │                                    │
│    │ Private VPC integration (opt)     │
│    ↓                                    │
│  ┌──────────────────────────────────┐  │
│  │  Lambda Functions                │  │
│  │  (VPC optional, not configured)  │  │
│  └──────────────────────────────────┘  │
│    │                                    │
│    │ AWS PrivateLink / Service endpoints│
│    ↓                                    │
│  ┌──────────────────────────────────┐  │
│  │  S3, DynamoDB, Textract,         │  │
│  │  Comprehend, Bedrock             │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

## Disaster Recovery Scenarios

### Scenario 1: Regional Failure (us-west-2 outage)

**Impact Assessment:**
```
✅ Available:
- DynamoDB data (replicated to us-east-2)
- Historical documents metadata
- Search capability (if stack deployed to DR)

❌ Unavailable:
- Document processing (Lambda, Step Functions)
- API Gateway endpoints
- S3 documents (no CRR configured)
- Cognito authentication (region-specific)
```

**Recovery Steps:**
1. Deploy CDK stack to us-east-2 (15 minutes)
2. Update CloudFront origin to new API Gateway
3. Create new Cognito User Pool in us-east-2
4. Migrate users (manual or via AWS Cognito backup/restore)
5. Update frontend config.json with new endpoints
6. Redeploy frontend to CloudFront

**Timeline:**
- Detection: 1-2 minutes (CloudWatch alarms)
- Decision: 5 minutes
- Deployment: 15 minutes
- Validation: 5 minutes
- **Total RTO: ~25-30 minutes**

### Scenario 2: Data Corruption

**Impact Assessment:**
```
✅ Available:
- Point-in-Time Recovery (35 days)
- On-demand backups
- DR region data (may also be corrupted if replication occurred)

❌ Risk:
- Corruption replicates to DR within 1 second
- Need to act quickly to disable replication
```

**Recovery Steps:**
1. Identify corruption timestamp
2. Disable Global Table replication (temporary)
3. Restore primary table from point-in-time
4. Verify data integrity
5. Re-enable replication
6. Allow sync to DR region

**Timeline:**
- Detection: Variable (depends on monitoring)
- Restoration: 1-2 hours (depends on table size)
- **Total RTO: 2-4 hours**

## Deployment Outputs Reference

```yaml
# Access URLs
CloudFrontURL: https://d3ozz2yllseyw8.cloudfront.net
APIEndpoint: https://l0sgxyjmic.execute-api.us-west-2.amazonaws.com/prod/

# Authentication
UserPoolId: us-west-2_dFwXN1Q3G
UserPoolClientId: 2m6v77c66qhj2q7i9eib2kpgt2
CognitoDomain: idp-901916-uswe
CognitoDomainURL: https://idp-901916-uswe.auth.us-west-2.amazoncognito.com

# Test Credentials
TestUserEmail: test@example.com
TestUserPassword: TestPassword123!

# Storage
DocumentsBucketName: intelligent-docs-232894901916-uswest2-38c413ba
FrontendBucketName: doc-processor-frontend-5b59e817

# Data
MetadataTableName: document-metadata-uswest2-df3261d7
HashRegistryTableName: document-hash-registry-uswest2-b2e970e1

# Monitoring
DashboardName: doc-processor-metrics-us-west-2-490d30ee
DLQQueueUrl: https://sqs.us-west-2.amazonaws.com/232894901916/lambda-dlq-us-west-2-9bd30b83

# Regions
PrimaryRegion: us-west-2
DRRegion: us-east-2

# CloudFront
CloudFrontDistributionId: EG3VA946DD39Z
CloudFrontDomainName: d3ozz2yllseyw8.cloudfront.net
```

## Resource Naming Convention

All resources follow a consistent naming pattern for easy identification:

```
Pattern: {service}-{purpose}-{region}-{uniqueId}

Examples:
- intelligent-docs-232894901916-uswest2-38c413ba (S3)
- doc-processor-metrics-us-west-2-490d30ee (Dashboard)
- document-metadata-uswest2-df3261d7 (DynamoDB)
- doc-processing-us-west-2 (Step Functions)
- doc-duplicate-check-us-west-2-a1b2c3d4 (Lambda)
```

## Security Architecture

### Authentication Flow

```
1. User → CloudFront → S3 Frontend
2. Frontend → Cognito Hosted UI
3. User enters credentials
4. Cognito validates & issues JWT tokens:
   ├── ID Token (user identity)
   ├── Access Token (API authorization)
   └── Refresh Token (session renewal)
5. Frontend stores tokens (localStorage)
6. API calls include: Authorization: Bearer <ID_TOKEN>
7. API Gateway Authorizer validates token with Cognito
8. If valid → Lambda execution
9. If invalid → 401 Unauthorized
```

### Encryption Architecture

```
┌──────────────────────────────────────────────┐
│         AWS KMS Master Key                   │
│         (Region-specific)                    │
└──────────────────────────────────────────────┘
                    │
                    │ Encrypts
                    ↓
┌──────────────────────────────────────────────┐
│  Data Encryption Keys (DEKs)                 │
├──────────────────────────────────────────────┤
│  ✓ S3 Objects (SSE-KMS)                      │
│  ✓ DynamoDB Items (KMS at rest)              │
│  ✓ CloudWatch Logs                           │
│  ✓ SQS Messages                              │
│  ✓ Lambda Environment Variables              │
│  ✓ EBS Volumes (Lambda ephemeral storage)    │
└──────────────────────────────────────────────┘
```

**In Transit:**
- HTTPS/TLS 1.2+ (CloudFront, API Gateway, S3)
- AWS PrivateLink (Lambda ↔ AWS Services)

## Cost Optimization Features

### 1. S3 Lifecycle Management
```
Day 0-30    → S3 Standard ($0.023/GB)
Day 30-90   → Intelligent-Tiering ($0.023/GB + $0.0025/1000 objects)
Day 90-365  → Glacier ($0.004/GB)
Day 365+    → Deep Archive ($0.00099/GB)

Example: 100GB document archive
- Month 1-3: $6.90/month
- Month 4-12: $1.20/month
- Year 2+: $0.30/month
```

### 2. Duplicate Detection
```
Without duplicate detection:
1,000 docs × 25% duplicates = 250 unnecessary processings
250 × ($0.0075 Textract + $0.0001 Comprehend + $0.03 Bedrock) = $9.44 wasted

With duplicate detection:
250 × $0.0001 hash check = $0.025
Savings: $9.42/month per 1,000 docs
```

### 3. DynamoDB On-Demand
```
No pre-provisioned capacity
Pay only for actual reads/writes
Auto-scales to any workload
No capacity planning needed

vs. Provisioned mode:
- 25 RCU + 25 WCU = $14.73/month (idle)
- On-demand: $0 when idle, $1.25 per million reads
```

## Recommended Diagram Tools

To create visual diagrams from this architecture:

### Option 1: Mermaid (Built into GitHub, VSCode)
The README already contains Mermaid diagrams that render automatically on GitHub.

### Option 2: AWS Architecture Icons (draw.io)
1. Go to https://app.diagrams.net/
2. Import AWS icon set: **Extras → Configuration → AWS**
3. Use these icons:
   - Amazon CloudFront (CDN)
   - Amazon S3 (Storage)
   - Amazon API Gateway (API)
   - AWS Lambda (Compute)
   - AWS Step Functions (Orchestration)
   - Amazon DynamoDB (Database)
   - Amazon Cognito (Security)
   - Amazon Textract, Comprehend, Bedrock (AI/ML)

### Option 3: CloudCraft (3D AWS Diagrams)
1. Go to https://www.cloudcraft.co/
2. Import from AWS account (auto-discovers resources)
3. Generate professional 3D diagrams
4. Export as PNG/SVG/PDF

### Option 4: AWS Application Composer
1. Open AWS Console → Application Composer
2. Import CloudFormation template (generated by CDK)
3. Visual drag-and-drop editor
4. Export diagram

### Option 5: Python Script (Automated)
Use the existing script: `scripts/generate_aws_architecture.py`

```bash
cd intelligent-doc-processor
python3 scripts/generate_aws_architecture.py --output images/dr-architecture.svg
```

---

**Document Version:** 1.0  
**Last Updated:** November 7, 2025  
**Stack Name:** SimplifiedDocProcessorStackV3  
**Primary Region:** us-west-2  
**DR Region:** us-east-2


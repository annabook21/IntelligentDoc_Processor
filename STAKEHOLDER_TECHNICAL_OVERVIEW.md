# AWS Contextual Chatbot - Technical Architecture Overview
## Stakeholder Presentation Document

---

## Executive Summary

The AWS Contextual Chatbot is a production-ready, enterprise-grade Retrieval-Augmented Generation (RAG) solution built on AWS serverless infrastructure. The system enables organizations to query their document repositories using natural language, receiving accurate, contextual answers with source citations.

**Key Benefits:**
- **Zero Infrastructure Management**: Fully serverless architecture with automatic scaling
- **Pay-per-Use Model**: No upfront costs, only pay for actual usage
- **Enterprise Security**: Built-in encryption, access controls, and content filtering
- **Production Ready**: Comprehensive monitoring, error handling, and disaster recovery
- **Multi-Region DR**: Automatic failover between us-west-2 and us-east-1 with <3 minute RTO
- **Health Monitoring**: Real-time health checks with Route 53 integration

---

## 1. Frontend Layer Components

### 1.1 CloudFront Distribution (Global CDN)

**Purpose**: Delivers the web application globally with low latency and high performance.

**Technical Implementation:**
- **Edge Locations**: 450+ globally distributed edge locations cache content close to users
- **HTTPS Enforcement**: Automatic SSL/TLS encryption for all traffic
- **Origin Access Control (OAC)**: Restricts S3 bucket access exclusively to CloudFront, preventing direct access
- **Error Handling**: Custom error pages (403/404) redirect to index.html for client-side routing
- **Caching Strategy**: Static assets (JS, CSS, images) cached with configurable TTL

**Business Value:**
- Sub-100ms response times globally
- 99.99% uptime SLA
- Automatic DDoS protection (AWS Shield Standard included)

### 1.2 S3 Frontend Bucket (Static Website Hosting)

**Purpose**: Hosts the compiled React application and runtime configuration.

**Technical Implementation:**
- **Bucket Policy**: Restricts access to CloudFront OAC only (zero public access)
- **Auto-Configuration**: CDK automatically injects API Gateway URL into config.json at deployment
- **Content Structure**:
  ```
  /build/
    ├── index.html (entry point)
    ├── static/js/main.[hash].js (React application)
    ├── static/css/main.[hash].css (styles)
    └── config.json (runtime API URL)
  ```

**Business Value:**
- No server management or patching required
- Automatic scaling to handle traffic spikes
- Extremely low cost (typically $0.01-0.50/month for low traffic)

### 1.3 React Application (User Interface)

**Purpose**: Provides an intuitive interface for document upload and natural language querying.

**Key Features:**
- **Drag-and-Drop Upload**: HTML5 File API with progress indicators
- **Real-Time Status Polling**: Monitors ingestion jobs every 5 seconds until completion
- **Chat Interface**: Conversation-style Q&A with message history
- **Source Citations**: Displays document sources with relevance scores
- **Responsive Design**: Mobile and desktop optimized

**Technical Stack:**
- React 18.x (functional components with hooks)
- Fetch API for RESTful communication
- No external state management libraries (uses React Context)

---

## 2. API Layer Components

### 2.1 API Gateway (REST API)

**Purpose**: Serverless API management with built-in throttling, authentication, and logging.

**Endpoints:**

| Endpoint | Method | Purpose | Lambda Handler |
|----------|--------|---------|----------------|
| `/docs` | POST | Submit user query | Query Lambda |
| `/upload` | POST | Generate pre-signed S3 URL | Upload Lambda |
| `/ingestion-status` | GET | Check document processing status | Status Lambda |
| `/health` | GET | System health check for DR monitoring | Health Lambda |

**Configuration:**
- **CORS**: Enabled for cross-origin requests from CloudFront domain
- **Usage Plan**: 100 requests/second rate limit, 200 burst capacity
- **Throttling**: Protects backend from abuse and controls costs
- **CloudWatch Logging**: Full request/response logging for debugging

**Security Features:**
- HTTPS-only enforcement
- Request validation (payload size limits, content-type checks)
- API keys (optional, not currently implemented)

**Business Value:**
- No server provisioning or scaling configuration
- Built-in DDoS protection
- Automatic request throttling prevents cost overruns

---

## 3. Compute Layer (Lambda Functions - 5 Total)

### 3.1 Query Lambda (`query-bedrock-llm`)

**Purpose**: Orchestrates the two-step RAG pipeline (Retrieve → Generate).

**Execution Flow:**
1. **Input Validation**: Sanitizes user query
2. **Context Retrieval**: Calls Bedrock Knowledge Base `Retrieve` API
   - Returns top-K relevant document chunks (default: K=5)
   - Each result includes text content and similarity score
3. **Prompt Construction**: Builds augmented prompt:
   ```
   Use the following context to answer the question:
   
   Context: [Retrieved chunks with sources]
   
   Question: [User query]
   
   Provide a detailed answer with citations.
   ```
4. **Guardrail Input Filtering**: Passes prompt through Bedrock Guardrail
   - Filters for: hate speech, insults, sexual content, violence
   - Blocks prompt if violations detected
5. **Model Invocation**: Calls Claude 3 Sonnet with InvokeModel API
   - Temperature: 0.7 (balanced creativity)
   - Max tokens: 2048 (sufficient for detailed answers)
6. **Guardrail Output Filtering**: Filters model response
7. **Citation Formatting**: Extracts and formats source references
8. **Response Return**: JSON response with answer and citations

**Performance Characteristics:**
- **Cold Start**: ~2-3 seconds (first invocation after idle period)
- **Warm Start**: 300-800ms (subsequent invocations)
- **Memory**: 512 MB (configurable, optimize based on CloudWatch metrics)
- **Timeout**: 60 seconds (allows for complex queries)

**Error Handling:**
- Bedrock throttling → Exponential backoff with 3 retries
- Model access denied → Clear error message to user
- Guardrail intervention → User-friendly content policy message

### 3.2 Upload Lambda (`generate-upload-url`)

**Purpose**: Generates secure, time-limited pre-signed S3 URLs for direct browser uploads.

**Why Pre-Signed URLs?**
- **Bypass Lambda Payload Limit**: Lambda has 6 MB request payload limit
- **Reduce Lambda Cost**: Direct S3 upload eliminates Lambda execution time
- **Better Performance**: Browser uploads directly to S3, no proxy layer
- **Security**: URLs expire in 5 minutes, preventing abuse

**Execution Flow:**
1. Receives filename from frontend
2. Adds timestamp prefix to prevent collisions: `${Date.now()}-${filename}`
3. Generates pre-signed PUT URL using AWS SDK S3 client
4. Returns URL to frontend
5. Frontend uploads directly to S3 using the URL

**Security Considerations:**
- URLs expire after 5 minutes
- Limited to PUT operation only
- Enforces content-type based on file extension

### 3.3 Ingestion Lambda (`start-ingestion-trigger`)

**Purpose**: Automatically triggers Knowledge Base ingestion when documents are uploaded.

**Trigger**: S3 ObjectCreated event (PUT, POST, CompleteMultipartUpload)

**Execution Flow:**
1. Receives S3 event notification
2. Extracts bucket name and object key
3. Calls Bedrock `StartIngestionJob` API
   - References the Knowledge Base ID
   - References the S3 Data Source ID
4. Returns ingestion job ID
5. On error → Message sent to DLQ for manual review

**Reliability Features:**
- **Dead Letter Queue (DLQ)**: Failed invocations go to SQS queue for investigation
- **Retry Policy**: Automatic retry on transient failures (2 attempts)
- **CloudWatch Alarms**: Trigger when DLQ receives messages

### 3.4 Status Lambda (`ingestion-status-check`)

**Purpose**: Provides real-time ingestion job status to the frontend.

**Execution Flow:**
1. Receives job ID from frontend
2. Calls Bedrock `GetIngestionJob` API
3. Returns status: `STARTING`, `IN_PROGRESS`, `COMPLETE`, `FAILED`
4. Frontend polls every 5 seconds until complete or failed

**Status Meanings:**
- **STARTING**: Job queued, waiting for resources
- **IN_PROGRESS**: Document being processed and vectorized
- **COMPLETE**: Vectors stored in OpenSearch, ready for queries
- **FAILED**: Processing error (check logs for details)

---

## 4. AI/ML Services

### 4.1 Amazon Bedrock Knowledge Base

**Purpose**: Fully managed RAG engine that handles document processing, vectorization, and retrieval.

**Architecture:**
- **S3 Data Source**: Monitors documents bucket for new files
- **Ingestion Pipeline**: Extracts text, chunks content, generates embeddings
- **Vector Store**: OpenSearch Serverless for semantic search

**Chunking Strategy:**
```
Max Tokens: 500
Overlap: 20% (100 tokens)
Hierarchy: Maintain document structure
```

**Why These Settings?**
- 500 tokens ≈ 1-2 paragraphs (good semantic unit)
- 20% overlap prevents context loss at chunk boundaries
- Balances precision vs. recall in retrieval

**Ingestion Process:**
1. **Text Extraction**: Supports PDF, TXT, DOCX, MD, HTML
2. **Chunking**: Splits into 500-token segments with 20% overlap
3. **Embedding**: Each chunk → 1536-dimensional vector (Titan G1)
4. **Indexing**: Vectors stored in OpenSearch with metadata
5. **Completion**: Typically 30-90 seconds per document

**Query Process:**
1. User query → Embedding (same Titan G1 model)
2. Vector similarity search in OpenSearch (cosine similarity)
3. Top-K chunks retrieved (K=5 by default)
4. Results include: chunk text, source document, similarity score

### 4.2 Amazon Titan G1 Embeddings

**Purpose**: Converts text into vector representations for semantic search.

**Technical Specifications:**
- **Model**: `amazon.titan-embed-text-v1`
- **Dimensions**: 1536 (industry standard, matches OpenAI ada-002)
- **Input Limit**: 8,192 tokens per embedding request
- **Output**: Normalized vector (cosine similarity optimized)

**Why Titan G1?**
- Optimized for English text
- Consistent with Knowledge Base requirements
- Lower cost than alternatives
- AWS-native (no data leaves AWS)

**Cost**: ~$0.0001 per 1,000 tokens (extremely low)

### 4.3 Claude 3 Sonnet (Anthropic)

**Purpose**: Generates human-like, contextual answers based on retrieved documents.

**Technical Specifications:**
- **Model ID**: `anthropic.claude-3-sonnet-20240229-v1:0`
- **Context Window**: 200,000 tokens (entire books fit in context)
- **Max Output**: 4,096 tokens per response
- **Strengths**: Reasoning, accuracy, safety, following instructions

**Why Claude 3 Sonnet?**
- Best balance of performance, cost, and intelligence
- Excellent at citing sources accurately
- Strong instruction-following (critical for RAG)
- Built-in safety features (reduces harmful outputs)

**Configuration in Lambda:**
```javascript
{
  temperature: 0.7,        // Balanced creativity
  max_tokens: 2048,        // Sufficient for detailed answers
  top_p: 0.9,              // Nucleus sampling
  anthropic_version: "bedrock-2023-05-31"
}
```

**Cost**: ~$3 per million input tokens, ~$15 per million output tokens

### 4.4 Bedrock Guardrails

**Purpose**: Responsible AI layer that filters harmful content in both inputs and outputs.

**Content Filters:**

| Category | Input Strength | Output Strength | Examples Blocked |
|----------|----------------|-----------------|------------------|
| Hate Speech | HIGH | HIGH | Slurs, discrimination |
| Insults | HIGH | HIGH | Personal attacks |
| Sexual Content | HIGH | HIGH | Explicit material |
| Violence | HIGH | HIGH | Graphic descriptions |

**How It Works:**
1. **Input Filtering**: User query analyzed before reaching model
2. **Output Filtering**: Model response analyzed before returning to user
3. **Intervention**: If violation detected → Request blocked with explanation
4. **Logging**: All interventions logged to CloudWatch for review

**Business Value:**
- **Risk Mitigation**: Prevents brand damage from inappropriate content
- **Compliance**: Helps meet content moderation requirements
- **User Safety**: Protects users from harmful outputs
- **Audit Trail**: Full logging for incident investigation

**Configuration Options:**
- Adjust strength per category (LOW/MEDIUM/HIGH)
- Add custom denied topics (e.g., financial advice, medical diagnosis)
- Configure custom word filters

### 4.5 OpenSearch Serverless (Vector Database)

**Purpose**: Stores and searches document embeddings for semantic retrieval.

**Architecture:**
- **Collections**: Isolated search environments
- **Indexes**: Store vectors with metadata (source document, chunk position)
- **Search Algorithm**: k-NN (k-Nearest Neighbors) with HNSW algorithm

**Why Serverless?**
- Zero capacity planning (auto-scales)
- No cluster management
- Pay only for storage + search requests
- Integrated with Bedrock Knowledge Bases

**Search Process:**
1. Query embedding passed to OpenSearch
2. HNSW algorithm finds nearest vectors (sub-100ms)
3. Results ranked by cosine similarity
4. Top-K chunks returned with scores

**Cost**: ~$0.24 per GB-month + $0.24 per OCU-hour during search

---

## 5. Storage Layer

### 5.1 Documents S3 Bucket

**Purpose**: Secure, versioned storage for source documents.

**Configuration:**
- **Versioning**: Enabled (protects against accidental deletions)
- **Encryption**: AES-256 server-side encryption
- **Public Access**: Completely blocked (all access via IAM only)
- **CORS**: Enabled for direct browser uploads
- **Lifecycle Policy**: Optional (e.g., archive to Glacier after 90 days)

**Event Notifications:**
```
Trigger: ObjectCreated (PUT, POST, CompleteMultipartUpload)
→ Invokes: Ingestion Lambda
```

**Versioning Benefits:**
- **Accidental Deletion Protection**: All versions retained
- **Point-in-Time Recovery**: Restore any previous version
- **Compliance**: Audit trail of all document changes
- **Rollback**: Revert to previous document version if needed

**Data Protection:**
- **11 9's Durability**: 99.999999999% annual durability
- **3 AZ Replication**: Data replicated across multiple availability zones
- **Encryption at Rest**: All objects encrypted automatically

---

## 6. Monitoring & Observability

### 6.1 CloudWatch Logs

**Purpose**: Centralized logging for debugging and audit trails.

**Log Groups:**
- `/aws/lambda/query-bedrock-llm`: All query executions
- `/aws/lambda/start-ingestion-trigger`: Document processing events
- `/aws/lambda/generate-upload-url`: Upload URL generation
- `/aws/lambda/ingestion-status-check`: Status polling

**Log Retention**: 7 days (configurable, balance cost vs. retention needs)

**Sample Log Entry:**
```json
{
  "timestamp": "2025-10-10T14:32:11.245Z",
  "requestId": "abc-123-def",
  "event": "query_received",
  "query": "What is RAG?",
  "retrievedChunks": 5,
  "modelLatency": 1234,
  "status": "success"
}
```

### 6.2 CloudWatch Alarms

**Pre-Configured Alarms:**

| Alarm | Threshold | Action |
|-------|-----------|--------|
| Lambda Errors > 5 | 5 errors in 5 minutes | SNS notification |
| DLQ Messages > 0 | Any message in DLQ | SNS notification |
| API Gateway 5xx > 10 | 10 errors in 5 minutes | SNS notification |

### 6.3 X-Ray Tracing

**Purpose**: Distributed tracing for performance optimization.

**Capabilities:**
- End-to-end request flow visualization
- Latency breakdown by service (API Gateway → Lambda → Bedrock)
- Error identification and root cause analysis
- Performance anomaly detection

---

## 7. Security Architecture

### 7.1 IAM Least Privilege

**Principle**: Each component has only the minimum permissions required.

**Example: Query Lambda Role**
```
Permissions:
✅ bedrock:Retrieve (specific Knowledge Base only)
✅ bedrock:InvokeModel (Claude 3 Sonnet only)
✅ bedrock:ApplyGuardrail (specific Guardrail only)
✅ logs:CreateLogStream, logs:PutLogEvents
❌ s3:* (no S3 access)
❌ bedrock:CreateKnowledgeBase (no management access)
```

### 7.2 Data Encryption

**At Rest:**
- S3: AES-256 server-side encryption
- OpenSearch: Encrypted using AWS KMS

**In Transit:**
- All API calls: TLS 1.2+
- CloudFront to Origin: HTTPS enforced
- Browser to CloudFront: HTTPS enforced

### 7.3 Network Isolation

- S3 buckets: No public access, CloudFront OAC only
- Lambda functions: VPC isolation optional (currently public subnet)
- API Gateway: Internet-facing with throttling

---

## 8. Cost Analysis

### 8.1 Monthly Cost Breakdown (500 queries, 100 documents)

| Service | Usage | Cost |
|---------|-------|------|
| **Bedrock (Titan Embeddings)** | 100 docs × 10 pages × 1,000 tokens = 1M tokens | $0.10 |
| **Bedrock (Claude Sonnet)** | 500 queries × (2K input + 500 output tokens) | $3.50 |
| **OpenSearch Serverless** | 1 GB storage + 10 OCU-hours | $2.64 |
| **Lambda** | 500 invocations × 1 second × 512 MB | $0.10 (Free Tier) |
| **API Gateway** | 1,500 requests | Free Tier |
| **S3** | 5 GB storage | Free Tier |
| **CloudFront** | 10 GB transfer | Free Tier |
| **TOTAL** | | **~$6.34/month** |

### 8.2 Cost Optimization Strategies

1. **Reduce Query Verbosity**: Shorter prompts = lower token costs
2. **Cache Common Queries**: Store frequent Q&A pairs
3. **Optimize Lambda Memory**: Right-size based on CloudWatch metrics
4. **Archive Old Documents**: Lifecycle policy to Glacier
5. **Monitor Bedrock Usage**: Set budget alerts

---

## 9. Disaster Recovery & High Availability

### 9.1 Backup Strategy

- **S3 Versioning**: All document versions retained
- **OpenSearch Snapshots**: Bedrock manages automatically
- **Infrastructure as Code**: Full stack reproducible via CDK

**Recovery Time Objective (RTO)**: < 1 hour
**Recovery Point Objective (RPO)**: < 5 minutes (S3 versioning)

### 9.2 Multi-Region Considerations

**Current**: Single region deployment
**Future Enhancement**: 
- Cross-region S3 replication
- Multi-region Knowledge Base (when supported)
- CloudFront already global (no change needed)

---

## 10. Future Enhancements Roadmap

### Phase 1: User Management (Q1 2026)
- **Cognito Authentication**: User sign-up/sign-in
- **User-Specific Documents**: Isolate documents per user
- **Role-Based Access Control**: Admin vs. standard users

### Phase 2: Advanced Features (Q2 2026)
- **Conversation Memory**: DynamoDB for chat history
- **Streaming Responses**: WebSocket API for real-time token streaming
- **Multi-Language Support**: Amazon Translate integration

### Phase 3: Analytics & Optimization (Q3 2026)
- **Usage Analytics**: QuickSight dashboard
- **Query Performance Metrics**: Response time tracking
- **A/B Testing**: Compare different models/prompts

---

## Appendix A: Deployment Guide

**Prerequisites:**
- AWS Account with Bedrock model access enabled
- AWS CLI configured
- Node.js 20.x+
- AWS CDK CLI
- Docker Desktop

**Deployment Steps:**
```bash
cd backend
npm install

# Bootstrap both regions (first time only)
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
cdk bootstrap aws://$ACCOUNT/us-west-2
cdk bootstrap aws://$ACCOUNT/us-east-1

# Deploy to BOTH regions simultaneously
cdk deploy --all  # 15-20 minutes
```

**Post-Deployment:**
1. Note CloudFront URL from CDK outputs
2. Verify Bedrock model access in console
3. Upload test document
4. Run sample queries

---

## Appendix B: Troubleshooting

**Issue: "Server side error" when querying**
- **Cause**: Bedrock model access not enabled
- **Solution**: Enable Titan G1 Embeddings and Claude 3 Sonnet in Bedrock console

**Issue: Ingestion stuck in IN_PROGRESS**
- **Cause**: Large file or many documents
- **Solution**: Wait 5-10 minutes, check Lambda logs for errors

**Issue: Upload fails**
- **Cause**: CORS misconfiguration
- **Solution**: Verify CORS rules on docs bucket

---

## Appendix C: Key Metrics to Monitor

| Metric | Target | Action if Exceeded |
|--------|--------|-------------------|
| Query Lambda Duration (P95) | < 5 seconds | Optimize retrieval or increase memory |
| Ingestion Success Rate | > 95% | Investigate DLQ messages |
| API Gateway 4xx Rate | < 5% | Check client-side validation |
| Bedrock Token Cost | < $10/day | Review query patterns, add caching |

---

## Conclusion

This AWS Contextual Chatbot demonstrates enterprise-grade serverless architecture with:
- **Zero infrastructure management**
- **Built-in security and compliance**
- **Automatic scaling**
- **Pay-per-use pricing**
- **Production-ready monitoring**

The solution is ready for stakeholder demonstration and can scale from prototype to production without architectural changes.

---

**Document Version**: 1.0  
**Last Updated**: October 10, 2025  
**Author**: AWS Contextual Chatbot Team


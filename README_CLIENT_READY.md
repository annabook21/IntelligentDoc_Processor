# AWS Contextual Chatbot with Amazon Bedrock Knowledge Bases

## Overview

The AWS Contextual Chatbot is a production-ready, enterprise-grade Retrieval-Augmented Generation (RAG) solution built on AWS serverless infrastructure. The system enables organizations to query their document repositories using natural language, receiving accurate, contextual answers with source citations.

This solution demonstrates best practices for building secure, scalable, and cost-effective AI-powered applications using Amazon Bedrock Knowledge Bases, Lambda functions, and multi-region disaster recovery.

⚠️ **Important**
- Running this code might result in charges to your AWS account.
- We recommend that you grant your code least privilege. At most, grant only the minimum permissions required to perform the task.
- This code is not tested in every AWS Region. For more information, see [AWS Regional Services](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/).

## Prerequisites

Before deploying this solution, ensure you have the following:

- AWS CLI installed and configured with appropriate permissions
- Node.js ≥ 22.9.0 and npm
- AWS CDK CLI v2
- Docker Desktop installed and running
- Access to Amazon Bedrock foundation models in your target regions

### Required AWS Permissions

Your AWS credentials must have permissions to:
- Create and manage CloudFormation stacks
- Deploy Lambda functions and API Gateway
- Create S3 buckets and configure CloudFront
- Access Amazon Bedrock services
- Create IAM roles and policies

### Bedrock Model Access

**CRITICAL**: Before deployment, enable access to these foundation models in the Amazon Bedrock console:

1. Navigate to the [Amazon Bedrock console](https://console.aws.amazon.com/bedrock/home)
2. Click **Model access** in the bottom-left corner
3. Click **Manage model access** in the top-right
4. Enable access for:
   - **Titan Embeddings G1 - Text**: `amazon.titan-embed-text-v1` (for Knowledge Base)
   - **Anthropic Claude 3 Sonnet**: `anthropic.claude-3-sonnet-20240229-v1:0` (for answer generation)

**Note**: Enable model access in **both** us-west-2 and us-east-1 regions for disaster recovery.

## Assumptions & Design Decisions

### Business Context Assumptions

**Document Volume & Types**
- Expected document volume: 100-10,000 documents per knowledge base
- Document types: PDF, TXT, DOCX, MD, HTML (common enterprise formats)
- Average document size: 1-50 pages per document
- Update frequency: Weekly to monthly document refreshes

**Usage Patterns**
- Concurrent users: 10-100 simultaneous users
- Query volume: 100-1,000 queries per day
- Query complexity: Multi-sentence questions requiring document synthesis
- Response time requirement: < 10 seconds for complex queries

**Data & Compliance**
- Data sensitivity: Internal enterprise documents (not public data)
- Compliance requirements: SOC 2, GDPR-ready architecture
- Data retention: 7 years for audit purposes
- Access control: Role-based access (future enhancement)

### Technical Design Decisions

**Architecture Pattern: Serverless-First**
- **Decision**: Fully serverless over containerized architecture
- **Rationale**: 
  - Zero infrastructure management overhead
  - Automatic scaling without capacity planning
  - Pay-per-use cost model aligns with variable workloads
  - Faster time-to-market for MVP deployment

**RAG Implementation: Manual Two-Step Process**
- **Decision**: Separate Retrieve + InvokeModel calls vs RetrieveAndGenerate API
- **Rationale**: 
  - Ensures comprehensive source citation (RetrieveAndGenerate may limit source references)
  - Provides granular control over context formatting and response structure
  - Enables custom prompt engineering between retrieval and generation steps
  - Allows for detailed logging and monitoring of each pipeline stage
  - More flexible error handling and retry logic for individual components

**Document Chunking Strategy: 500 Tokens, 20% Overlap**
- **Decision**: Fixed-size chunks with significant overlap
- **Rationale**:
  - 500 tokens ≈ 1-2 paragraphs (optimal semantic unit)
  - 20% overlap prevents context loss at boundaries
  - Balances precision vs. recall in retrieval
  - Compatible with Claude 3 Sonnet's context window

**Vector Store: Bedrock-Managed OpenSearch Serverless**
- **Decision**: Managed service over self-hosted alternatives
- **Rationale**:
  - Zero operational overhead (no cluster management)
  - Automatic scaling and cost optimization
  - Tight integration with Bedrock Knowledge Bases
  - No additional infrastructure to monitor or maintain

**Disaster Recovery: Manual Backend Failover**
- **Decision**: Manual config.json update vs automatic DNS failover
- **Rationale**: 
  - **Current Constraint**: Organization-level restrictions prevent custom domain creation in sandbox environment
  - **Future Enhancement**: Automatic DNS failover via Route 53 health checks (requires custom domain)
  - Manual control over failover timing and validation
  - Cost-effective (no Route 53 health checks needed)
  - Simpler implementation for MVP without custom domain dependency

**Frontend Architecture: Static SPA on S3 + CloudFront**
- **Decision**: Static hosting over Amplify or EC2
- **Rationale**:
  - Simplest deployment model with global CDN
  - Automatic HTTPS and edge caching
  - Minimal cost and operational overhead
  - Easy to implement origin failover for DR

### Operational Assumptions

**Monitoring & Alerting**
- CloudWatch native monitoring sufficient for initial deployment
- SNS email notifications for critical alerts
- No third-party monitoring tools required initially
- 24/7 monitoring not required (business hours support acceptable)

**Maintenance Windows**
- Monthly maintenance windows acceptable
- Zero-downtime deployments via blue-green approach
- Emergency patches during business hours with 2-hour advance notice

**Support Model**
- AWS Support Center for infrastructure issues
- Internal team handles application-level support
- No dedicated DevOps team required initially
- Documentation and runbooks sufficient for L1 support

**Cost Optimization**
- Pay-per-use model acceptable for variable workloads
- No upfront capacity reservations required
- Monthly cost reviews and optimization cycles
- Right-sizing recommendations based on usage patterns

### Constraints & Limitations

**Current Limitations**
- **Manual Backend Failover**: Organization-level restrictions prevent custom domain creation in sandbox environment
- No user authentication (planned for Phase 2)
- No multi-tenant support (single knowledge base per deployment)
- Manual document upload only (no API-based ingestion)
- English language only (no multi-language support)

**Future Enhancements**
- **Automatic Backend Failover**: Route 53 DNS failover with custom domain (requires organization approval)
- Cognito integration for user management
- Multi-knowledge base support
- API-based document ingestion
- Multi-language document processing

## Architecture

The solution implements a fully serverless, multi-region architecture with hybrid failover capabilities:

![AWS Contextual Chatbot Architecture](images/full-architecture.svg)

### Architecture Overview

**Global Distribution Layer:**
- **CloudFront Global CDN Distribution**: Single entry point for all traffic with automatic frontend failover
- **Primary Origin (us-west-2)**: S3 Bucket Frontend Primary serves static content
- **Failover Origin (us-east-1)**: S3 Bucket Frontend Secondary for automatic frontend failover scenarios

**Primary Region (us-west-2) - Active Components:**
- **Frontend Storage**: S3 Bucket Frontend Primary with static React application
- **API Layer**: API Gateway (REST API) with 4 endpoints
- **Lambda Functions (5 total)**:
  - Lambda Query: Handles user queries and RAG orchestration
  - Lambda Upload: Manages document uploads via pre-signed URLs
  - Lambda Status: Provides ingestion status monitoring
  - Lambda Ingest: Handles document ingestion triggered by S3 events
  - Lambda Health: Performs system health checks
- **Bedrock Services**:
  - Bedrock Knowledge Base: Managed RAG engine with document chunking
  - Bedrock Guardrails: Content safety and policy enforcement
  - Bedrock Claude Sonnet: Large language model for answer generation
- **Data Storage & Search**:
  - OpenSearch Serverless: Vector database for semantic search
  - S3 Bucket (Documents): Versioned document storage
- **Monitoring & Alerting**:
  - CloudWatch Dashboard: Real-time system metrics
  - SQS Dead Letter Queue: Captures failed processing events
  - SNS Topic Alerts: Sends notifications for critical issues

**Failover Region (us-east-1) - Standby Components:**
- **Frontend Storage**: S3 Bucket Frontend Secondary (failover origin)
- **API Layer**: API Gateway (Standby) with identical endpoints
- **Lambda Functions**: All 5 Lambda functions deployed in standby mode
- **Bedrock Services**: Complete Bedrock stack in standby configuration
- **Data Storage**: OpenSearch Serverless (Standby) and S3 Documents (Replica)
- **Cross-Region Replication**: Automatic data synchronization from primary to failover (manual setup required)

### Data Flow
1. **User Request** → CloudFront → S3 Frontend (Primary/Failover)
2. **API Calls** → API Gateway → Lambda Functions → Bedrock Services
3. **Document Upload** → S3 Documents → Ingestion Lambda → Bedrock Knowledge Base
4. **Query Processing** → Bedrock Knowledge Base → OpenSearch Serverless → Claude Sonnet
5. **Monitoring** → CloudWatch → SNS Alerts → Operations Team

### Core Components

#### Frontend Layer
- **CloudFront Distribution**: Global CDN with origin failover (automatic < 1 second RTO)
- **S3 Frontend Buckets**: Private buckets with Origin Access Control (OAC) in both regions
- **React Application**: Modern web interface with drag-and-drop file uploads and real-time chat

#### API Layer
- **API Gateway**: RESTful API with CORS, throttling, and usage plans
- **Endpoints**:
  - `POST /docs`: Submit queries to the chatbot
  - `POST /upload`: Generate pre-signed URLs for file uploads
  - `GET /ingestion-status`: Check document processing status
  - `GET /health`: Health check for monitoring and failover

#### Compute Layer (5 Lambda Functions)
- **Query Lambda**: Core RAG orchestration (Retrieve + Generate with Claude 3 Sonnet)
- **Upload Lambda**: Generate pre-signed S3 URLs for direct file uploads
- **Ingestion Lambda**: Triggered by S3 events to start Bedrock ingestion jobs
- **Status Lambda**: Poll Bedrock for ingestion job status
- **Health Lambda**: Test Bedrock connectivity for monitoring

#### AI/ML Services
- **Bedrock Knowledge Base**: Automated document chunking (500 tokens, 20% overlap)
- **Titan Embeddings**: Vectorization of document chunks
- **Claude 3 Sonnet**: Answer generation with context from retrieved chunks
- **Bedrock Guardrails**: Content filtering for harmful content

#### Storage
- **S3 Documents Bucket**: Versioned, encrypted storage with lifecycle policies
- **OpenSearch Serverless**: Vector store for semantic search (managed by Bedrock)

#### Monitoring & Observability
- **CloudWatch Dashboard**: Real-time metrics for API Gateway, Lambda, and Bedrock
- **CloudWatch Alarms**: Automated alerts for errors and system health
- **X-Ray Tracing**: Distributed tracing across all services
- **SNS Notifications**: Alert delivery for operational teams

## Security Architecture

### Data Protection
- **Encryption at Rest**: All S3 buckets use S3-managed encryption
- **Encryption in Transit**: HTTPS enforcement via CloudFront and API Gateway
- **Versioning**: S3 versioning enabled for point-in-time recovery
- **Access Controls**: Private S3 buckets with OAC, no public access

### Content Safety
- **Bedrock Guardrails**: Multi-category content filtering (sexual, violence, hate, insults)
- **Input Validation**: API Gateway request validation and throttling
- **Least Privilege**: IAM roles with minimal required permissions

### Network Security
- **Private S3 Origins**: No direct S3 access, only via CloudFront OAC
- **CORS Configuration**: Restricted cross-origin requests
- **VPC Integration**: Ready for VPC deployment if required

## Disaster Recovery & Business Continuity

### ⚡ Frontend Failover: AUTOMATIC
- **Method**: CloudFront Origin Group with automatic failover
- **Trigger**: 5xx errors (500, 502, 503, 504) from primary S3 bucket
- **RTO**: < 1 second (automatic)
- **User Impact**: None (same CloudFront URL, transparent to users)
- **Implementation**: CloudFront automatically retries against failover origin

### 🔧 Backend API Failover: MANUAL
- **Method**: Runtime configuration via config.json update
- **Detection**: Manual monitoring or custom alerting
- **RTO**: Manual (minutes to hours depending on response time)
- **Process**: Update config.json in both S3 frontend buckets, invalidate CloudFront cache
- **Why Manual**: 
  - **Current Constraint**: Organization-level restrictions prevent custom domain creation in sandbox environment
  - **Future Enhancement**: Automatic DNS failover via Route 53 health checks (requires custom domain)
  - **Alternative**: Simpler implementation for MVP without custom domain dependency

### 📊 Summary: Hybrid Failover Approach
- **Frontend (Static Content)**: ✅ **Automatic** - CloudFront handles transparently
- **Backend (API Calls)**: ⚠️ **Manual** - Requires config.json update
- **Data (Documents)**: ✅ **Automatic** - S3 Cross-Region Replication (manual setup required)

### Data Synchronization
- **Method**: S3 Cross-Region Replication (CRR) - manual setup required
- **RPO**: ~15 minutes (automatic background sync)
- **Scope**: Documents bucket from us-west-2 → us-east-1

## Performance & Scalability

### Auto-scaling Capabilities
- **Lambda**: Automatic scaling based on request volume
- **API Gateway**: Handles up to 10,000 requests per second
- **CloudFront**: Global edge caching for static content
- **Bedrock**: Managed service with automatic scaling

### Performance Optimizations
- **Edge Caching**: Static assets cached at 450+ CloudFront edge locations
- **Connection Pooling**: Lambda functions optimized for AWS service connections
- **Chunking Strategy**: 500-token chunks with 20% overlap for optimal retrieval

## Cost Analysis

### Monthly Cost Estimates (US East/West)
**Estimated costs** based on moderate usage (1,000 queries/month, 10GB documents). Actual costs may vary based on usage patterns and AWS pricing changes:

| Service | Primary Region | Failover Region | Monthly Cost |
|---------|---------------|-----------------|--------------|
| Lambda (Compute) | $2-5 | $1-3 | $3-8 |
| API Gateway | $1-3 | $0.50-1.50 | $1.50-4.50 |
| S3 Storage | $0.25-0.50 | $0.25-0.50 | $0.50-1.00 |
| CloudFront | $1-2 | - | $1-2 |
| Bedrock (Titan) | $0.50-1.50 | $0.50-1.50 | $1-3 |
| Bedrock (Claude) | $5-15 | $5-15 | $10-30 |
| **Total** | | | **$17-49** |

*Note: Failover region costs only apply during active failover scenarios.*

### Cost Optimization Recommendations
- Enable S3 lifecycle policies for document retention
- Monitor Bedrock usage and optimize chunk sizes
- Use CloudWatch to track and optimize Lambda cold starts
- Consider Reserved Capacity for predictable workloads

## Deployment

### Multi-Region Deployment

```bash
# Navigate to backend directory
cd backend

# Bootstrap both regions (one-time setup)
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
cdk bootstrap aws://$ACCOUNT/us-west-2
cdk bootstrap aws://$ACCOUNT/us-east-1

# Deploy to both regions
cdk deploy --all
```

This creates:
- `BackendStack-Primary` in us-west-2 with CloudFront distribution
- `BackendStack-Failover` in us-east-1 with standby resources

### Single-Region Deployment (Development)

```bash
# Set target region
export AWS_DEFAULT_REGION=us-west-2

# Bootstrap (one-time)
cdk bootstrap aws://$ACCOUNT/us-west-2

# Deploy
cdk deploy BackendStack-Primary
```

## Usage

### Initial Setup
1. Navigate to the CloudFront URL provided in deployment outputs
2. Upload documents using the file upload interface
3. Wait for ingestion status to show "Complete"
4. Begin querying your documents

### API Usage Examples

#### Submit a Query
```bash
curl -X POST https://your-api-gateway-url/prod/docs \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the key features of this product?"}'
```

#### Check Ingestion Status
```bash
curl https://your-api-gateway-url/prod/ingestion-status
```

#### Health Check
```bash
curl https://your-api-gateway-url/prod/health
```

## Monitoring & Operations

### CloudWatch Dashboard
Access the dashboard named `contextual-chatbot-metrics-{region}` to monitor:
- API Gateway request counts and error rates
- Lambda function performance and errors
- Bedrock service health
- Dead Letter Queue message counts

### Key Metrics to Monitor
- **API Gateway**: 4xx/5xx error rates, request latency
- **Lambda**: Error rates, duration, cold starts
- **Bedrock**: Retrieval latency, generation latency
- **S3**: Request counts, error rates

### Alerting
Configured alarms trigger SNS notifications for:
- Query Lambda errors (>5 in 5 minutes)
- Ingestion Lambda errors (>3 in 5 minutes)
- Dead Letter Queue messages (any messages)

## Troubleshooting

### Common Issues

#### Deployment Failures
- **Bedrock Model Access**: Ensure model access is enabled in both regions
- **Docker Issues**: Verify Docker Desktop is running
- **Permissions**: Check IAM permissions for CDK deployment

#### Runtime Issues
- **"Model not accessible"**: Verify Bedrock model access in target region
- **Upload failures**: Check S3 bucket permissions and CORS configuration
- **Query timeouts**: Monitor Lambda duration and Bedrock service limits

### Debugging Commands
```bash
# Check Lambda logs
aws logs tail /aws/lambda/query-bedrock-llm-{region} --follow

# Test Bedrock connectivity
aws bedrock list-foundation-models --region us-west-2

# Verify S3 bucket access
aws s3 ls s3://your-docs-bucket-name
```

## Additional Resources

- [Amazon Bedrock Developer Guide](https://docs.aws.amazon.com/bedrock/latest/userguide/)
- [AWS Lambda Developer Guide](https://docs.aws.amazon.com/lambda/latest/dg/)
- [Amazon S3 Developer Guide](https://docs.aws.amazon.com/s3/latest/userguide/)
- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/latest/guide/)
- [Amazon Bedrock API Reference](https://docs.aws.amazon.com/bedrock/latest/APIReference/)

## Support & Maintenance

### Operational Procedures
- Monitor CloudWatch dashboards daily
- Review SNS alerts promptly
- Test failover procedures quarterly
- Update Bedrock models as new versions become available

### Maintenance Windows
- **Scheduled**: Monthly during maintenance windows
- **Emergency**: As needed for critical issues
- **Updates**: Follow AWS service announcements for new features

### Support Contacts
- **AWS Support**: Use AWS Support Center for service issues
- **Documentation**: Refer to AWS documentation for service-specific guidance
- **Community**: AWS re:Post for community support and best practices

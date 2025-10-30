# Intelligent Document Processing Pipeline

A production-ready, serverless document processing pipeline built on AWS using **Amazon Bedrock Agents and Flows** for modern, efficient document intelligence extraction. This solution automatically processes thousands of documents, extracts keywords, entities, locations, and phrases, detects languages, and stores extracted data in a highly available, searchable format.

## Overview

This pipeline processes documents (PDF, DOCX, etc.) uploaded to S3, automatically extracting:
- **Keywords and key phrases** using Amazon Comprehend
- **Named entities** (people, places, organizations) using Amazon Comprehend
- **Document language** using automatic language detection
- **Text content** from scanned/images using Amazon Textract

The extracted data is stored in:
- **DynamoDB** for structured metadata queries
- **OpenSearch** for full-text search capabilities
- **S3** for original document retention with cost-optimized lifecycle policies

## Architecture

The solution uses **Bedrock Agents and Flows** instead of traditional Lambda functions for orchestration, providing:
- More efficient AI workload orchestration
- Native integration with AWS AI services
- Simplified workflow management
- Better scalability and cost optimization

### High-Level Architecture

```
┌─────────────────┐
│  Document Upload│
│  (S3 Bucket)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SQS Queue      │◄─── S3 Event Notification
│  (Processing)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Bedrock Agent   │◄─── Invokes Flow
│ (Orchestrator)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Bedrock Flow    │───► Textract (Text Extraction)
│ (Workflow)      │───► Comprehend (Language Detection)
│                 │───► Comprehend (Entity Extraction)
│                 │───► Comprehend (Key Phrase Extraction)
│                 │───► DynamoDB (Metadata Storage)
│                 │───► OpenSearch (Full-Text Index)
└─────────────────┘
```

### Core Components

#### 1. Document Ingestion Layer
- **S3 Bucket**: Receives documents via direct upload or API
- **S3 Event Notifications**: Triggers processing automatically
- **SQS Queue**: Queues documents for parallel processing
- **Dead Letter Queue (DLQ)**: Captures failed processing attempts

#### 2. Processing Layer (Bedrock Agents & Flows)
- **Bedrock Agent**: Orchestrates document processing workflow
- **Bedrock Flow**: Defines multi-step processing pipeline:
  1. Text extraction (Textract)
  2. Language detection (Comprehend)
  3. Entity extraction (Comprehend)
  4. Key phrase extraction (Comprehend)
  5. Metadata summarization (Claude)
  6. Storage (DynamoDB + OpenSearch)

#### 3. Storage Layer
- **DynamoDB**: Stores document metadata with GSIs for language/entity queries
- **OpenSearch**: Full-text search index for document content
- **S3 Lifecycle Policies**: Automatic cost optimization (Intelligent-Tiering → Glacier → Deep Archive)

#### 4. API Layer
- **API Gateway**: RESTful API for search and metadata retrieval
- **Search Endpoint**: `/search` - Full-text and metadata queries
- **Metadata Endpoint**: `/metadata/{documentId}` - Get document metadata
- **Health Endpoint**: `/health` - System health check

#### 5. Monitoring & Observability
- **CloudWatch Dashboard**: Real-time metrics and monitoring
- **CloudWatch Alarms**: Automated alerts for processing failures
- **SNS Notifications**: Alert delivery for operational teams

## Key Features

✅ **Automatic Processing**: No human intervention required - documents processed as they arrive  
✅ **Parallel Processing**: SQS queue enables concurrent document processing  
✅ **Error Handling**: DLQ captures failures with retry logic and notifications  
✅ **Cost Optimization**: S3 lifecycle policies for long-term storage  
✅ **Highly Available**: DynamoDB and OpenSearch provide searchable data storage  
✅ **Language Detection**: Automatic language detection for multi-language documents  
✅ **Entity Extraction**: Extracts people, places, organizations, dates, etc.  
✅ **Modern Architecture**: Uses Bedrock Agents and Flows instead of traditional Lambda orchestration  
✅ **Infrastructure as Code**: Fully deployable via AWS CDK  
✅ **Monitoring**: Comprehensive CloudWatch dashboards and alarms  
✅ **Security**: Encryption at rest and in transit, IAM least privilege  

## Prerequisites

- **AWS CLI** installed and configured
- **Node.js** ≥ 22.9.0 and npm
- **AWS CDK CLI** v2: `npm install -g aws-cdk`
- **Docker Desktop** (for Lambda bundling)
- **Bedrock Model Access** enabled in your AWS account:
  - `amazon.titan-embed-text-v1` (for embeddings if needed)
  - `anthropic.claude-3-sonnet-20240229-v1:0` (for summarization)

### Enable Bedrock Model Access

1. Navigate to [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/home)
2. Click **Model access** in bottom-left corner
3. Click **Manage model access**
4. Enable:
   - **Titan Embeddings G1 - Text**: `amazon.titan-embed-text-v1`
   - **Anthropic Claude 3 Sonnet**: `anthropic.claude-3-sonnet-20240229-v1:0`

## Deployment

### 1. Clone and Setup

```bash
git clone <repository-url>
cd intelligent-doc-processor/backend
npm install
```

### 2. Bootstrap AWS CDK

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=us-west-2  # or your preferred region
cdk bootstrap aws://$ACCOUNT/$REGION
```

### 3. Deploy Stack

```bash
cdk deploy IntelligentDocProcessorStack
```

The deployment creates:
- S3 bucket for documents
- SQS queues (processing + DLQ)
- DynamoDB table with GSIs
- OpenSearch domain
- Bedrock Agent and Flow
- API Gateway with endpoints
- CloudWatch dashboard and alarms

### 4. Note Deployment Outputs

After deployment, note the outputs:
- `DocumentsBucketName` - Upload documents here
- `APIEndpoint` - API Gateway URL
- `FlowId` - Bedrock Flow ID
- `AgentId` - Bedrock Agent ID
- `DashboardName` - CloudWatch dashboard

## Usage

### Upload Documents

Upload documents to the S3 bucket (from deployment outputs):

```bash
aws s3 cp document.pdf s3://<DocumentsBucketName>/
```

Documents are automatically processed via the pipeline.

### Search Documents

#### Full-Text Search

```bash
curl "https://<APIEndpoint>/search?q=security+policy&limit=10"
```

#### Search by Language

```bash
curl "https://<APIEndpoint>/search?language=en&limit=10"
```

#### Search by Entity Type

```bash
curl "https://<APIEndpoint>/search?entityType=PERSON&limit=10"
```

### Get Document Metadata

```bash
curl "https://<APIEndpoint>/metadata/<documentId>"
```

### Health Check

```bash
curl "https://<APIEndpoint>/health"
```

## Architecture Diagram

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture diagrams.

## Cost Optimization

The solution implements several cost optimization strategies:

1. **S3 Lifecycle Policies**: 
   - Intelligent-Tiering after 30 days
   - Glacier after 90 days
   - Deep Archive after 365 days

2. **DynamoDB On-Demand**: Pay per request, no capacity planning needed

3. **OpenSearch**: Single-node development instance (upgrade for production)

4. **Bedrock Pay-Per-Use**: Only pay for what you process

## Security

- **Encryption**: All data encrypted at rest (S3, DynamoDB, OpenSearch) and in transit (HTTPS)
- **IAM**: Least privilege access policies
- **VPC**: OpenSearch can be deployed in VPC (configure in stack)
- **Access Control**: Private S3 bucket, no public access
- **Audit**: CloudTrail logging enabled for all API calls

## Monitoring

Access the CloudWatch dashboard:
1. Go to CloudWatch Console
2. Navigate to Dashboards
3. Open dashboard: `doc-processor-metrics-<region>`

### Key Metrics
- Processing queue depth
- Failed documents (DLQ)
- Document processing rate
- API Gateway request/error rates

### Alarms
- DLQ messages (any failure triggers alert)
- Queue depth (backlog alert at 100 documents)
- SNS notifications sent to subscribed email/SMS

## Disaster Recovery

For production deployments, consider:
- **Multi-Region Replication**: S3 Cross-Region Replication
- **DynamoDB Global Tables**: Multi-region metadata
- **OpenSearch Multi-AZ**: High availability configuration
- **Regular Backups**: S3 versioning + OpenSearch snapshots

See [DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md) for DR setup guide.

## Troubleshooting

### Documents Not Processing

1. Check SQS queue: `aws sqs get-queue-attributes --queue-url <queue-url>`
2. Check DLQ for failures: `aws sqs receive-message --queue-url <dlq-url>`
3. Check CloudWatch Logs: `/aws/lambda/document-processor-<region>`

### Bedrock Agent/Flow Issues

1. Verify Agent exists: `aws bedrock-agent get-agent --agent-id <agent-id>`
2. Check Flow definition: `aws bedrock-agent get-flow --flow-id <flow-id>`
3. Review IAM permissions for Bedrock Agent role

### OpenSearch Connection Issues

1. Verify endpoint: Check deployment outputs
2. Check security groups (if VPC-deployed)
3. Test connectivity: `curl -X GET https://<endpoint>`

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

MIT License - see [LICENSE](LICENSE) file.

## References

- [Amazon Bedrock Flows Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/flows.html)
- [AWS Bedrock Flows Samples](https://github.com/aws-samples/amazon-bedrock-flows-samples)
- [Amazon Textract Documentation](https://docs.aws.amazon.com/textract/)
- [Amazon Comprehend Documentation](https://docs.aws.amazon.com/comprehend/)


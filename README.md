# Intelligent Document Processing Pipeline

A simplified, production-ready serverless document processing pipeline built on AWS following the [AWS Intelligent Document Processing Workshop](https://catalog.workshops.aws/intelligent-document-processing/en-US) pattern. This solution automatically processes documents, extracts keywords, entities, locations, and phrases, detects languages, and stores extracted data in a searchable format.

## Overview

This pipeline processes documents (PDF, DOCX, images) uploaded to S3, automatically extracting:
- **Text content** from documents using Amazon Textract
- **Language** using Amazon Comprehend language detection
- **Named entities** (people, places, organizations) using Amazon Comprehend
- **Key phrases** using Amazon Comprehend

The extracted data is stored in:
- **DynamoDB** for structured metadata queries
- **S3** for original document retention with cost-optimized lifecycle policies

## Architecture

This solution follows the **AWS Workshop Pattern** - simple, direct, and efficient:

```
┌─────────────┐
│ S3 Bucket   │ (Documents)
└──────┬──────┘
       │
       ▼ EventBridge
┌─────────────┐
│ Lambda      │ Process Document
│ Function    │
└──────┬──────┘
       │
       ├─→ Textract (extract text)
       ├─→ Comprehend (language)
       ├─→ Comprehend (entities)
       ├─→ Comprehend (key phrases)
       └─→ DynamoDB (store metadata)
```

### Core Components

1. **S3 Bucket**: Stores original documents, triggers processing on upload
2. **EventBridge Rule**: Routes S3 events to Lambda
3. **Lambda Function**: Orchestrates Textract + Comprehend processing
4. **DynamoDB Table**: Stores extracted metadata with GSI for language queries
5. **API Gateway**: REST API for searching metadata

## Key Features

✅ **Automatic Processing**: No human intervention - documents processed automatically  
✅ **Parallel Processing**: EventBridge enables concurrent document processing  
✅ **Error Handling**: Dead Letter Queue captures failures with retry logic  
✅ **Cost Optimization**: S3 lifecycle policies (Intelligent-Tiering → Glacier → Deep Archive)  
✅ **Language Detection**: Automatic language detection for multi-language documents  
✅ **Entity Extraction**: Extracts people, places, organizations, dates, etc.  
✅ **Simple Architecture**: Direct Lambda → Textract → Comprehend → DynamoDB  
✅ **Infrastructure as Code**: Fully deployable via AWS CDK  
✅ **Monitoring**: CloudWatch dashboards and alarms  

## Why This Simplified Architecture?

This follows the AWS Workshop pattern instead of using Bedrock Flows because:
- **Bedrock Flows** are overkill for batch document processing (better for conversational AI)
- **OpenSearch** isn't needed if you're only searching metadata (DynamoDB GSIs are sufficient)
- **VPC** isn't required for serverless services unless your SCP explicitly requires it
- **Direct Lambda** is simpler, faster to deploy, and easier to debug

For full-text search of document content, you can add OpenSearch later. For complex workflow logic, you can add Step Functions later. But start simple.

## Prerequisites

- **AWS CLI** installed and configured
- **Node.js** ≥ 22.9.0 and npm
- **AWS CDK CLI** v2: `npm install -g aws-cdk`
- **Docker Desktop** (for Lambda bundling)

## Deployment

### 1. Clone and Setup

```bash
git clone https://github.com/annabook21/IntelligentDoc_Processor.git
cd IntelligentDoc_Processor/backend
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
cdk deploy SimplifiedDocProcessorStack
```

The deployment creates:
- S3 bucket for documents
- DynamoDB table with GSI
- Lambda function for document processing
- Lambda function for search API
- API Gateway with endpoints
- CloudWatch dashboard and alarms

### 4. Note Deployment Outputs

After deployment, note the outputs:
- `DocumentsBucketName` - Upload documents here
- `APIEndpoint` - API Gateway URL
- `DashboardName` - CloudWatch dashboard

## Usage

### Upload Documents

Upload documents to the S3 bucket:

```bash
aws s3 cp document.pdf s3://<DocumentsBucketName>/
```

Documents are automatically processed via the pipeline.

### Search Documents

#### Search by Language

```bash
curl "https://<APIEndpoint>/search?language=en&limit=10"
```

#### Get Document Metadata

```bash
curl "https://<APIEndpoint>/metadata/<documentId>"
```

Note: Replace `<documentId>` with the full S3 key, e.g., `bucket-name/path/to/document.pdf`

#### Health Check

```bash
curl "https://<APIEndpoint>/health"
```

## Cost Optimization

The solution implements several cost optimization strategies:

1. **S3 Lifecycle Policies**: 
   - Intelligent-Tiering after 30 days
   - Glacier after 90 days
   - Deep Archive after 365 days

2. **DynamoDB On-Demand**: Pay per request, no capacity planning needed

3. **Serverless Architecture**: Pay only for what you use (Lambda invocations, API Gateway requests)

Estimated cost: ~$20-50/month for moderate usage (1000 documents/month, 100GB storage)

## Security

- **Encryption**: All data encrypted at rest (S3, DynamoDB with KMS) and in transit (HTTPS)
- **IAM**: Least privilege access policies
- **Access Control**: Private S3 bucket, no public access
- **API Authentication**: IAM authentication on search endpoints (can add Cognito if needed)

## Monitoring

Access the CloudWatch dashboard:
1. Go to CloudWatch Console
2. Navigate to Dashboards
3. Open dashboard: `doc-processor-metrics-<region>`

### Key Metrics
- Document processing rate
- Failed documents (DLQ)
- API Gateway request/error rates

### Alarms
- DLQ messages (any failure triggers alert)
- Lambda errors
- SNS notifications sent to subscribed email/SMS

## Architecture Comparison

### Simplified (Current)
- ✅ Lambda → Textract → Comprehend → DynamoDB
- ✅ ~200 lines of CDK
- ✅ Fast deployment
- ✅ Easy to debug
- ✅ Lower cost

### Previous (Over-Engineered)
- ❌ EventBridge → Lambda → Bedrock Flow → Textract/Comprehend → DynamoDB/OpenSearch
- ❌ ~400+ lines of CDK
- ❌ Complex VPC setup
- ❌ Slower deployment
- ❌ Harder to debug
- ❌ Higher cost

## When to Add Complexity

Only add if you actually need:

- **OpenSearch**: Only if you need full-text search of document content (not just metadata)
- **Step Functions**: Only if you need complex workflow logic with conditional branching
- **Bedrock Flows**: Only if you need conversational AI workflows
- **VPC**: Only if your SCP explicitly requires it for all resources

## Troubleshooting

### Documents Not Processing

1. Check EventBridge rule: Verify S3 events are being sent
2. Check DLQ for failures: `aws sqs receive-message --queue-url <dlq-url>`
3. Check CloudWatch Logs: `/aws/lambda/doc-processor-<region>`

### API Gateway Issues

1. Verify endpoint: Check deployment outputs
2. Check IAM permissions for API calls
3. Verify DynamoDB table exists

## References

- [AWS Intelligent Document Processing Workshop](https://catalog.workshops.aws/intelligent-document-processing/en-US)
- [Amazon Textract Documentation](https://docs.aws.amazon.com/textract/)
- [Amazon Comprehend Documentation](https://docs.aws.amazon.com/comprehend/)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)

## License

MIT License - see [LICENSE](LICENSE) file.

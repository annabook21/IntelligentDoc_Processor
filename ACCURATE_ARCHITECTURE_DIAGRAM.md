# AWS Contextual Chatbot - Accurate Architecture Diagram

## Complete Architecture Overview

```mermaid
graph TB
    %% User and Frontend Layer
    User[👤 User] -->|HTTPS| CloudFront[☁️ CloudFront Distribution<br/>Global CDN with Origin Failover]
    
    %% Frontend Storage
    CloudFront -->|Primary Origin| FrontendS3Primary[💾 S3 Frontend Bucket<br/>us-west-2]
    CloudFront -.->|Failover on 5xx| FrontendS3Failover[💾 S3 Frontend Bucket<br/>us-east-1]
    
    %% API Gateway
    CloudFront -->|API Calls| APIGateway[🔌 API Gateway<br/>REST API with CORS]
    
    %% Lambda Functions (5 Core Functions)
    APIGateway -->|POST /docs| QueryLambda[⚡ Query Lambda<br/>query-bedrock-llm]
    APIGateway -->|POST /upload| UploadLambda[⚡ Upload Lambda<br/>generate-upload-url]
    APIGateway -->|GET /ingestion-status| StatusLambda[⚡ Status Lambda<br/>get-ingestion-status]
    APIGateway -->|GET /health| HealthLambda[⚡ Health Lambda<br/>api-health-check]
    
    %% Bedrock Services
    QueryLambda -->|Retrieve| BedrockKB[🧠 Bedrock Knowledge Base<br/>Vector Store Management]
    QueryLambda -->|InvokeModel| BedrockModel[🤖 Claude 3 Sonnet<br/>anthropic.claude-3-sonnet-20240229-v1:0]
    QueryLambda -->|ApplyGuardrail| BedrockGuardrails[🛡️ Bedrock Guardrails<br/>Content Filtering]
    
    %% Document Processing
    UploadLambda -->|Generate Pre-signed URLs| DocsS3[💾 S3 Documents Bucket<br/>Versioned & Encrypted]
    DocsS3 -->|S3 Event Trigger| IngestLambda[⚡ Ingest Lambda<br/>start-ingestion-trigger]
    IngestLambda -->|StartIngestionJob| BedrockKB
    
    %% Vector Store
    BedrockKB -->|Managed Vector Store| OpenSearch[🔍 OpenSearch Serverless<br/>Vector Embeddings Storage]
    
    %% Status Checking
    StatusLambda -->|ListIngestionJobs| BedrockKB
    HealthLambda -->|GetKnowledgeBase| BedrockKB
    
    %% Monitoring & Observability
    QueryLambda -.->|Logs & Metrics| CloudWatch[📊 CloudWatch<br/>Logs, Metrics, Dashboard]
    IngestLambda -.->|Logs & Metrics| CloudWatch
    UploadLambda -.->|Logs & Metrics| CloudWatch
    StatusLambda -.->|Logs & Metrics| CloudWatch
    HealthLambda -.->|Logs & Metrics| CloudWatch
    
    %% Alarms and Alerting
    CloudWatch -->|Alarms| SNS[📧 SNS Topic<br/>Alert Notifications]
    IngestLambda -.->|Failed Messages| DLQ[⚠️ Dead Letter Queue<br/>Error Handling]
    DLQ -->|Alarms| CloudWatch
    
    %% Deployment Validation
    ModelCheckLambda[⚡ Model Check Lambda<br/>bedrock-model-access-check] -->|ListFoundationModels| BedrockModel
    ModelCheckLambda -.->|Deployment Validation| CustomResource[🔧 Custom Resource<br/>CDK Deployment Check]
    
    %% Multi-Region Replication
    DocsS3 -.->|Cross-Region Replication<br/>(Manual Setup)| DocsS3Failover[💾 S3 Documents Bucket<br/>us-east-1 Replica]
    
    %% Styling
    classDef userClass fill:#ff9999,stroke:#333,stroke-width:2px
    classDef frontendClass fill:#99ccff,stroke:#333,stroke-width:2px
    classDef computeClass fill:#ffcc99,stroke:#333,stroke-width:2px
    classDef storageClass fill:#99ff99,stroke:#333,stroke-width:2px
    classDef aiClass fill:#ff99ff,stroke:#333,stroke-width:2px
    classDef monitoringClass fill:#ffff99,stroke:#333,stroke-width:2px
    
    class User userClass
    class CloudFront,FrontendS3Primary,FrontendS3Failover frontendClass
    class APIGateway,QueryLambda,UploadLambda,StatusLambda,HealthLambda,IngestLambda,ModelCheckLambda computeClass
    class DocsS3,DocsS3Failover,OpenSearch storageClass
    class BedrockKB,BedrockModel,BedrockGuardrails aiClass
    class CloudWatch,SNS,DLQ,CustomResource monitoringClass
```

## Detailed Component Breakdown

### Frontend Layer
- **CloudFront Distribution**: Global CDN with automatic origin failover
- **S3 Frontend Buckets**: Private buckets in both regions with OAC

### API Layer  
- **API Gateway**: RESTful API with 4 endpoints and CORS support
- **Usage Plan**: Throttling (100 req/sec, 200 burst)

### Compute Layer (5 Lambda Functions)
1. **Query Lambda** (`query-bedrock-llm`): Core RAG orchestration
2. **Upload Lambda** (`generate-upload-url`): Pre-signed URL generation
3. **Ingest Lambda** (`start-ingestion-trigger`): Document processing
4. **Status Lambda** (`get-ingestion-status`): Job monitoring
5. **Health Lambda** (`api-health-check`): System health checks

### AI/ML Services
- **Bedrock Knowledge Base**: Document chunking and vector management
- **Claude 3 Sonnet**: Answer generation with context
- **Bedrock Guardrails**: Content filtering and safety
- **OpenSearch Serverless**: Vector embeddings storage

### Storage Layer
- **S3 Documents Bucket**: Versioned, encrypted document storage
- **Cross-Region Replication**: Manual setup for DR

### Monitoring & Observability
- **CloudWatch Dashboard**: Real-time metrics visualization
- **CloudWatch Alarms**: Automated alerting (3 alarms configured)
- **SNS Topic**: Alert delivery mechanism
- **Dead Letter Queue**: Failed ingestion error handling
- **X-Ray Tracing**: Distributed tracing (enabled on all Lambdas)

### Deployment & Validation
- **Model Check Lambda**: Pre-deployment Bedrock model validation
- **Custom Resource**: CDK deployment validation framework

## Multi-Region Deployment

### Primary Region (us-west-2)
- Full backend stack with CloudFront distribution
- All Lambda functions, Bedrock services, and monitoring

### Failover Region (us-east-1)  
- Complete backend stack (standby)
- Frontend S3 bucket as CloudFront failover origin
- Manual backend API failover via config.json update

## Key Architectural Decisions

1. **Manual RAG Process**: Separate Retrieve + InvokeModel for Guardrails support
2. **Serverless-First**: All compute via Lambda for zero infrastructure management
3. **Managed Services**: Bedrock Knowledge Base + OpenSearch Serverless
4. **Origin Failover**: CloudFront automatic frontend failover (< 1 second RTO)
5. **Content Safety**: Bedrock Guardrails for enterprise compliance
6. **Comprehensive Monitoring**: CloudWatch + X-Ray + SNS alerting

## Disaster Recovery Strategy

- **Frontend**: Automatic CloudFront origin failover
- **Backend**: Manual config.json update (can be enhanced with Route 53 DNS)
- **Data**: S3 Cross-Region Replication (manual setup required)
- **Monitoring**: Alarms and SNS notifications in both regions

# Intelligent Document Processor - Architecture Documentation

**Last Updated:** November 12, 2025  
**Stack Version:** Based on actual CDK deployment code

---

## Table of Contents

- [System Overview](#system-overview)
- [Complete System Architecture](#complete-system-architecture)
- [Component Details](#component-details)
- [Document Processing Flow](#document-processing-flow)
- [API Architecture](#api-architecture)
- [Data Storage Architecture](#data-storage-architecture)
- [Network & Security Architecture](#network--security-architecture)
- [Monitoring & Observability](#monitoring--observability)
- [Disaster Recovery](#disaster-recovery)

---

## System Overview

The Intelligent Document Processor is a serverless AWS application that processes documents uploaded to S3 using Amazon Bedrock Flows for orchestration. The architecture follows AWS best practices with VPC-isolated resources, KMS encryption, and comprehensive monitoring.

### Key Technologies

- **Orchestration**: Amazon Bedrock Flows (replacing Step Functions)
- **Compute**: AWS Lambda (Node.js 20.x)
- **Storage**: Amazon S3 (KMS encrypted, versioned)
- **Database**: Amazon DynamoDB (single table, one GSI)
- **Search**: Amazon OpenSearch Service (VPC-only, private endpoint)
- **Security**: AWS KMS, IAM, VPC Security Groups, CloudTrail
- **Monitoring**: CloudWatch Logs, Metrics, Alarms, Dashboard
- **Event Routing**: Amazon EventBridge

---

## Complete System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        User[👤 User/Application]
        CLI[AWS CLI / SDK]
    end

    subgraph "API Layer"
        APIGW[🌐 API Gateway REST API<br/>IAM Authentication<br/>Throttling: 100 req/s]
        subgraph "API Endpoints"
            HealthEP[GET /health<br/>Public]
            SearchEP[GET/POST /search<br/>IAM Auth]
            MetaEP[GET /metadata/:id<br/>IAM Auth]
        end
    end

    subgraph "Lambda Layer"
        APIHandler[λ API Handler<br/>Consolidated Handler<br/>30s timeout<br/>VPC: Private Subnet]
        FlowInvoker[λ Flow Invoker<br/>EventBridge Target<br/>5min timeout]
        FlowCreator[λ Flow Creator<br/>Custom Resource<br/>5min timeout]
    end

    subgraph "Event Processing"
        S3Bucket[📦 S3 Documents Bucket<br/>KMS Encrypted<br/>Versioned<br/>EventBridge Enabled<br/>Lifecycle: 30d→IA, 90d→Glacier]
        EB[⚡ EventBridge<br/>S3 Event Pattern<br/>Object Created]
        BedrockFlow[🤖 Bedrock Flow<br/>Claude Sonnet 3<br/>Document Processing]
    end

    subgraph "Data Layer"
        DDB[(💾 DynamoDB<br/>Metadata Table<br/>PK: documentId<br/>SK: processingDate<br/>KMS Encrypted<br/>PITR Enabled)]
        GSI[📊 GSI: LanguageIndex<br/>PK: language<br/>SK: processingDate]
        OpenSearch[(🔍 OpenSearch 2.3<br/>VPC-Only Private Endpoint<br/>Multi-AZ: 2 nodes<br/>KMS Encrypted<br/>Node-to-Node Encryption)]
    end

    subgraph "VPC: us-west-2"
        subgraph "Private Subnets (2 AZs)"
            APIHandler
            OpenSearch
            VPCEndpointS3[VPC Endpoint<br/>S3 Gateway]
            VPCEndpointDDB[VPC Endpoint<br/>DynamoDB Gateway]
        end
        subgraph "Public Subnets (2 AZs)"
            NAT[NAT Gateway<br/>Single Instance]
        end
        SG_Lambda[🔒 Lambda SG<br/>Allow Outbound All]
        SG_OS[🔒 OpenSearch SG<br/>Allow 443 from Lambda SG]
    end

    subgraph "Security & Encryption"
        KMS[🔑 AWS KMS<br/>Customer Managed Key<br/>Auto-Rotation Enabled]
        CloudTrail[📋 CloudTrail<br/>Audit Logging<br/>Multi-region: false]
        IAM_Flow[👤 IAM Role<br/>Bedrock Flow Execution]
        IAM_Lambda[👤 IAM Roles<br/>Lambda Execution]
    end

    subgraph "Monitoring & Alerting"
        CW[📊 CloudWatch<br/>Logs & Metrics]
        CWDash[📈 CloudWatch Dashboard<br/>Flow Metrics<br/>API Metrics<br/>Lambda Errors<br/>DLQ Depth]
        Alarms[🚨 CloudWatch Alarms<br/>Flow Errors<br/>DLQ Messages]
        SNS[📧 SNS Topic<br/>Alert Notifications]
        DLQ[📮 SQS DLQ<br/>Lambda Error Handler<br/>14-day retention<br/>KMS Encrypted]
    end

    User -->|HTTPS| APIGW
    CLI -->|HTTPS| APIGW
    APIGW --> HealthEP
    APIGW --> SearchEP
    APIGW --> MetaEP
    HealthEP --> APIHandler
    SearchEP --> APIHandler
    MetaEP --> APIHandler

    APIHandler -->|Query/Scan| DDB
    DDB -->|Use Index| GSI
    APIHandler -->|Full-text Search| OpenSearch
    APIHandler -.->|Via VPC Endpoint| VPCEndpointDDB
    APIHandler -.->|HTTPS 443| OpenSearch

    User -->|Upload Document| S3Bucket
    S3Bucket -->|Object Created Event| EB
    EB -->|Trigger| FlowInvoker
    FlowInvoker -->|InvokeFlow API| BedrockFlow
    BedrockFlow -->|Orchestrate Processing| FlowInvoker
    FlowInvoker -->|Store Metadata| DDB
    FlowInvoker -.->|Read Document| S3Bucket

    FlowCreator -.->|Create/Update/Delete| BedrockFlow
    FlowCreator -.->|Custom Resource| CloudFormation[☁️ CloudFormation]

    S3Bucket -.->|Encrypted by| KMS
    DDB -.->|Encrypted by| KMS
    OpenSearch -.->|Encrypted by| KMS
    DLQ -.->|Encrypted by| KMS

    FlowInvoker -->|On Error| DLQ
    APIHandler -->|On Error| DLQ
    FlowCreator -->|On Error| DLQ

    DLQ -->|Messages Visible| Alarms
    FlowInvoker -->|Metrics| CW
    APIHandler -->|Metrics| CW
    APIGW -->|Metrics| CW
    CW -->|Aggregate| CWDash
    Alarms -->|Notify| SNS

    CloudTrail -->|Audit S3/DDB/Lambda| CW
    BedrockFlow -.->|Use Role| IAM_Flow
    APIHandler -.->|Use Role| IAM_Lambda
    FlowInvoker -.->|Use Role| IAM_Lambda

    APIHandler -.->|Security Group| SG_Lambda
    OpenSearch -.->|Security Group| SG_OS
    SG_Lambda -->|HTTPS 443| SG_OS

    style User fill:#e1f5ff
    style S3Bucket fill:#ff9900
    style BedrockFlow fill:#ff6b9d
    style DDB fill:#527fff
    style OpenSearch fill:#005EB8
    style KMS fill:#ffcc00
    style DLQ fill:#ff6b6b
    style Alarms fill:#ff9900
    style OpenSearch fill:#005eb8
    style VPCEndpointS3 fill:#90EE90
    style VPCEndpointDDB fill:#90EE90
```

---

## Component Details

### Lambda Functions

The system uses **3 Lambda functions** (not the 6+ described in the incorrect architecture):

```mermaid
graph LR
    subgraph "Lambda Functions"
        FC[Flow Creator<br/>Custom Resource Handler<br/>5min timeout<br/>Node.js 20.x<br/>Creates Bedrock Flow]
        FI[Flow Invoker<br/>EventBridge Target<br/>5min timeout<br/>Node.js 20.x<br/>Invokes Bedrock Flow]
        API[API Handler<br/>Consolidated API<br/>30s timeout<br/>Node.js 20.x<br/>VPC-attached<br/>Routes: health, search, metadata]
    end

    subgraph "Environment Variables"
        FC_ENV[METADATA_TABLE_NAME<br/>OPENSEARCH_ENDPOINT<br/>DOCS_BUCKET_NAME]
        FI_ENV[FLOW_ID<br/>METADATA_TABLE_NAME]
        API_ENV[OPENSEARCH_ENDPOINT<br/>METADATA_TABLE_NAME]
    end

    subgraph "IAM Permissions"
        FC_IAM[bedrock:CreateFlow<br/>bedrock:GetFlow<br/>bedrock:UpdateFlow<br/>bedrock:DeleteFlow<br/>bedrock:ListFlows]
        FI_IAM[bedrock-runtime:InvokeFlow<br/>s3:GetObject<br/>dynamodb:PutItem]
        API_IAM[es:ESHttpGet<br/>es:ESHttpPost<br/>dynamodb:Query<br/>dynamodb:Scan]
    end

    FC -.->|Uses| FC_ENV
    FI -.->|Uses| FI_ENV
    API -.->|Uses| API_ENV

    FC -.->|Requires| FC_IAM
    FI -.->|Requires| FI_IAM
    API -.->|Requires| API_IAM

    style FC fill:#87CEEB
    style FI fill:#87CEEB
    style API fill:#90EE90
```

**Important**: There are NO separate Lambda functions for:
- Textract operations (textract-start, textract-status)
- Comprehend analysis
- Bedrock summarization
- Duplicate checking
- Upload handling
- Individual search/metadata handlers

These operations are either:
1. **Orchestrated by Bedrock Flow** (Textract, Comprehend processing)
2. **Handled by the consolidated API Handler** (search, metadata retrieval)
3. **Not implemented** (duplicate checking, upload presigned URLs)

---

## Document Processing Flow

### High-Level Flow

```mermaid
sequenceDiagram
    participant User
    participant S3 as S3 Documents Bucket
    participant EB as EventBridge
    participant FI as Flow Invoker Lambda
    participant BF as Bedrock Flow
    participant Claude as Claude Sonnet 3
    participant DDB as DynamoDB

    User->>S3: Upload document via CLI/SDK
    Note over S3: EventBridge enabled on bucket
    S3->>EB: Object Created event
    EB->>FI: Trigger Lambda
    Note over FI: Parse S3 event<br/>Extract bucket/key
    FI->>BF: InvokeFlow(s3Bucket, s3Key, documentId)
    Note over BF: Flow Definition<br/>Input → Prompt → Output
    BF->>Claude: Process document metadata
    Claude-->>BF: Return processing result
    BF-->>FI: Flow output (JSON)
    FI->>DDB: Store metadata
    Note over DDB: documentId: bucket/key<br/>processingDate: timestamp<br/>processingStatus: completed<br/>flowOutput: result
    FI-->>EB: Success
```

### Bedrock Flow Definition

The flow is defined in `document-processing-flow.json`:

```mermaid
graph LR
    Input[📥 Flow Input<br/>s3Bucket<br/>s3Key<br/>documentId] --> Prompt[🤖 Prompt Node<br/>Claude Sonnet 3<br/>Process document info]
    Prompt --> Output[📤 Flow Output<br/>documentId<br/>status: initiated<br/>processingResult]

    style Input fill:#90EE90
    style Prompt fill:#ff6b9d
    style Output fill:#87CEEB
```

**Current Flow Behavior**:
- The flow receives S3 bucket, key, and document ID
- Claude Sonnet 3 generates a response acknowledging document receipt
- Returns status "initiated" with document metadata
- **Note**: Actual text extraction via Textract and NLP via Comprehend would require adding Lambda tool nodes to the flow

---

## API Architecture

### API Gateway Configuration

```mermaid
graph TB
    subgraph "API Gateway: doc-processor-api"
        Root[/ root]
        Health[/health<br/>GET - No Auth]
        Search[/search<br/>GET/POST - IAM Auth]
        Meta[/metadata<br/>/:documentId<br/>GET - IAM Auth]
    end

    subgraph "API Handler Lambda"
        Router[Request Router<br/>Path-based routing]
        HealthHandler[Health Check Handler<br/>Check DynamoDB<br/>Check OpenSearch]
        SearchHandler[Search Handler<br/>OpenSearch full-text<br/>DynamoDB by language<br/>DynamoDB scan]
        MetaHandler[Metadata Handler<br/>Query by documentId]
    end

    Root --> Health
    Root --> Search
    Root --> Meta

    Health --> Router
    Search --> Router
    Meta --> Router

    Router -->|/health| HealthHandler
    Router -->|/search| SearchHandler
    Router -->|/metadata/:id| MetaHandler

    HealthHandler -->|Check| DDB[(DynamoDB)]
    HealthHandler -->|Check| OS[(OpenSearch)]
    SearchHandler -->|Full-text| OS
    SearchHandler -->|Query| DDB
    MetaHandler -->|Query| DDB

    style Health fill:#90EE90
    style Search fill:#ff9900
    style Meta fill:#ff9900
```

### API Endpoints

| Endpoint | Method | Auth | Purpose | Query Parameters |
|----------|--------|------|---------|------------------|
| `/health` | GET | None | Health check | None |
| `/search` | GET | IAM | Search documents | `q`, `language`, `entityType`, `limit`, `offset` |
| `/search` | POST | IAM | Search documents | Body: `{ query, filters }` |
| `/metadata/{documentId}` | GET | IAM | Get document metadata | Path: `documentId` |

### Authentication Flow

```mermaid
sequenceDiagram
    participant Client
    participant APIGW as API Gateway
    participant IAM as AWS IAM
    participant Lambda as API Handler

    Client->>Client: Sign request with AWS credentials
    Client->>APIGW: HTTPS Request<br/>Authorization: AWS4-HMAC-SHA256...
    APIGW->>IAM: Verify signature
    IAM-->>APIGW: Authorization result
    alt Authorized
        APIGW->>Lambda: Invoke with IAM context
        Lambda-->>APIGW: Response
        APIGW-->>Client: 200 OK
    else Unauthorized
        APIGW-->>Client: 403 Forbidden
    end
```

**Note**: Unlike the incorrect architecture, there is **NO Cognito** in this system. Authentication is **IAM-based** using AWS Signature Version 4.

---

## Data Storage Architecture

### DynamoDB Table Schema

```mermaid
erDiagram
    DOCUMENT_METADATA {
        string documentId PK "Format: bucket/key"
        string processingDate SK "ISO 8601 timestamp"
        string s3Bucket
        string s3Key
        string processingStatus "completed, failed, initiated"
        object flowOutput "Raw Bedrock Flow output"
        string processedAt "ISO 8601 timestamp"
        string language "Optional: detected language"
    }

    LANGUAGE_INDEX {
        string language PK "GSI PK"
        string processingDate SK "GSI SK"
        string documentId "Projected"
    }

    DOCUMENT_METADATA ||--o{ LANGUAGE_INDEX : "GSI"
```

**Table Configuration**:
- **Billing Mode**: Pay-per-request (on-demand)
- **Encryption**: Customer-managed KMS key
- **Point-in-Time Recovery**: Enabled
- **Removal Policy**: RETAIN (data persists after stack deletion)

**Global Secondary Index (GSI)**:
- **Name**: LanguageIndex
- **Partition Key**: `language` (String)
- **Sort Key**: `processingDate` (String)
- **Projection**: All attributes

### OpenSearch Configuration

```mermaid
graph TB
    subgraph "OpenSearch Domain"
        subgraph "AZ 1"
            Node1[Data Node 1<br/>t3.small.search<br/>20 GB EBS]
        end
        subgraph "AZ 2"
            Node2[Data Node 2<br/>t3.small.search<br/>20 GB EBS]
        end
    end

    subgraph "Security"
        KMS[KMS Encryption<br/>At Rest]
        TLS[Node-to-Node TLS<br/>In Transit]
        VPC[VPC-Only Access<br/>Private Subnets]
        SG[Security Group<br/>Port 443 from Lambda]
    end

    Node1 -.->|Replicate| Node2
    Node2 -.->|Replicate| Node1

    Node1 -.->|Encrypted| KMS
    Node2 -.->|Encrypted| KMS
    Node1 -.->|TLS| Node2
    Node1 -.->|Private IP| VPC
    Node2 -.->|Private IP| VPC
    VPC -.->|Ingress Control| SG

    style Node1 fill:#005eb8
    style Node2 fill:#005eb8
    style KMS fill:#ffcc00
    style VPC fill:#90EE90
```

**Domain Configuration**:
- **Version**: OpenSearch 2.3
- **Capacity**: 2 data nodes (Multi-AZ)
- **Instance Type**: t3.small.search
- **EBS Volume**: 20 GB per node
- **Encryption**: KMS at rest, TLS in transit
- **Endpoint**: **VPC-only, NO public access**
- **Access Control**: IAM-based via security groups

**Index Schema** (Expected):
- **Index Name**: `documents`
- **Fields**: `documentId`, `content`, `summary`, `keyPhrases`, `entities`, `language`
- **Search**: Multi-match query with fuzzy matching

---

## Network & Security Architecture

### VPC Design

```mermaid
graph TB
    subgraph "VPC: DocProcessorVPC"
        subgraph "Availability Zone 1"
            Public1[Public Subnet<br/>10.0.1.0/24<br/>NAT Gateway]
            Private1[Private Subnet<br/>10.0.3.0/24<br/>Lambda + OpenSearch]
        end
        subgraph "Availability Zone 2"
            Public2[Public Subnet<br/>10.0.2.0/24]
            Private2[Private Subnet<br/>10.0.4.0/24<br/>Lambda + OpenSearch]
        end

        IGW[Internet Gateway]
        NAT[NAT Gateway<br/>Single instance<br/>Cost optimization]
        S3EP[S3 VPC Endpoint<br/>Gateway<br/>FREE]
        DDBEP[DynamoDB VPC Endpoint<br/>Gateway<br/>FREE]
    end

    subgraph "External"
        Internet[Internet]
        S3[S3 Service]
        DDB[DynamoDB Service]
    end

    Internet --> IGW
    IGW --> Public1
    IGW --> Public2
    Public1 --> NAT
    NAT --> Private1
    NAT --> Private2

    Private1 -.->|No internet egress| S3EP
    Private2 -.->|No internet egress| S3EP
    Private1 -.->|No internet egress| DDBEP
    Private2 -.->|No internet egress| DDBEP

    S3EP -.->|Private link| S3
    DDBEP -.->|Private link| DDB

    style Private1 fill:#ff9900
    style Private2 fill:#ff9900
    style S3EP fill:#90EE90
    style DDBEP fill:#90EE90
    style NAT fill:#ffcc00
```

**VPC Configuration**:
- **Max AZs**: 2
- **NAT Gateways**: 1 (cost optimization, not HA)
- **Subnets**:
  - **Public**: 2 subnets (CIDR /24) with IGW route
  - **Private with Egress**: 2 subnets (CIDR /24) with NAT route

**VPC Endpoints** (Cost Optimization):
- **S3 Gateway Endpoint**: FREE (no hourly charge)
- **DynamoDB Gateway Endpoint**: FREE (no hourly charge)
- No interface endpoints needed (API Gateway, Bedrock accessed via public internet from Lambda in VPC)

### Security Groups

```mermaid
graph TB
    subgraph "Lambda Security Group"
        LambdaSG[🔒 Lambda SG<br/>Inbound: None<br/>Outbound: All]
    end

    subgraph "OpenSearch Security Group"
        OSSG[🔒 OpenSearch SG<br/>Inbound: 443 from Lambda SG<br/>Outbound: None]
    end

    LambdaSG -->|HTTPS 443| OSSG
    LambdaSG -->|Outbound All| Internet[Internet<br/>API Gateway, Bedrock]
    LambdaSG -->|Private Link| S3EP[S3 Endpoint]
    LambdaSG -->|Private Link| DDBEP[DynamoDB Endpoint]

    style LambdaSG fill:#90EE90
    style OSSG fill:#ff9900
```

### Encryption Architecture

```mermaid
graph TB
    subgraph "KMS Customer Managed Key"
        KMS[🔑 KMS Key<br/>Alias: doc-processor-us-west-2<br/>Auto-rotation: Enabled<br/>Removal Policy: RETAIN]
    end

    subgraph "Encrypted Resources"
        S3[📦 S3 Bucket<br/>SSE-KMS]
        DDB[(💾 DynamoDB<br/>Customer Managed Key)]
        OpenSearch[(🔍 OpenSearch<br/>At-Rest Encryption)]
        SQS[📮 SQS DLQ<br/>SSE-KMS]
        Lambda[λ Lambda Env Vars<br/>Can be KMS encrypted]
    end

    subgraph "Data in Transit"
        TLS1[HTTPS/TLS 1.2+<br/>API Gateway]
        TLS2[HTTPS<br/>OpenSearch Node-to-Node]
        TLS3[AWS SDK TLS<br/>Lambda → AWS Services]
    end

    KMS -->|Encrypts| S3
    KMS -->|Encrypts| DDB
    KMS -->|Encrypts| OpenSearch
    KMS -->|Encrypts| SQS
    KMS -.->|Optional| Lambda

    style KMS fill:#ffcc00
    style S3 fill:#90EE90
    style DDB fill:#90EE90
    style OpenSearch fill:#90EE90
```

### IAM Roles & Permissions

```mermaid
graph TB
    subgraph "Lambda Execution Roles"
        FlowCreatorRole[Flow Creator Role<br/>bedrock:CreateFlow<br/>bedrock:GetFlow<br/>bedrock:UpdateFlow<br/>bedrock:DeleteFlow<br/>logs:CreateLogGroup]
        FlowInvokerRole[Flow Invoker Role<br/>bedrock-runtime:InvokeFlow<br/>s3:GetObject<br/>dynamodb:PutItem<br/>kms:Decrypt<br/>logs:CreateLogGroup]
        APIHandlerRole[API Handler Role<br/>es:ESHttpGet, ESHttpPost<br/>dynamodb:Query, Scan<br/>kms:Decrypt<br/>ec2:CreateNetworkInterface<br/>logs:CreateLogGroup]
    end

    subgraph "Service Roles"
        BedrockFlowRole[Bedrock Flow Execution Role<br/>bedrock:InvokeModel<br/>bedrock:InvokeFlow<br/>s3:GetObject<br/>Assumed by: bedrock.amazonaws.com]
    end

    subgraph "Principle of Least Privilege"
        Note1[Each role has ONLY<br/>the permissions needed<br/>for its function]
    end

    FlowCreatorRole -.->|Assumed by| Lambda1[λ Flow Creator]
    FlowInvokerRole -.->|Assumed by| Lambda2[λ Flow Invoker]
    APIHandlerRole -.->|Assumed by| Lambda3[λ API Handler]
    BedrockFlowRole -.->|Assumed by| BedrockFlow[🤖 Bedrock Flow]

    style FlowCreatorRole fill:#87CEEB
    style FlowInvokerRole fill:#87CEEB
    style APIHandlerRole fill:#87CEEB
    style BedrockFlowRole fill:#ff6b9d
```

---

## Monitoring & Observability

### CloudWatch Dashboard

```mermaid
graph TB
    subgraph "CloudWatch Dashboard: doc-processor-metrics"
        Widget1[Flow Invocations<br/>Total invocations<br/>Errors in red]
        Widget2[DLQ Messages<br/>Queue depth<br/>Orange line]
        Widget3[API Gateway Requests<br/>Total requests<br/>4XX errors orange<br/>5XX errors red]
        Widget4[Lambda Errors<br/>Flow Creator red<br/>Flow Invoker red<br/>API Handler red]
    end

    subgraph "Metrics Sources"
        FlowInvoker[λ Flow Invoker<br/>Invocations<br/>Errors<br/>Duration]
        DLQ[SQS DLQ<br/>ApproximateNumberOfMessagesVisible]
        APIGW[API Gateway<br/>Count<br/>4XXError<br/>5XXError]
        Lambdas[All Lambdas<br/>Errors]
    end

    FlowInvoker -->|Metrics| Widget1
    DLQ -->|Metrics| Widget2
    APIGW -->|Metrics| Widget3
    Lambdas -->|Metrics| Widget4

    style Widget1 fill:#90EE90
    style Widget2 fill:#ff9900
    style Widget3 fill:#87CEEB
    style Widget4 fill:#ff6b6b
```

### CloudWatch Alarms & Alerting

```mermaid
graph TB
    subgraph "CloudWatch Alarms"
        Alarm1[🚨 Flow Error Alarm<br/>Metric: Flow Invoker Errors<br/>Threshold: 5 errors in 5 min<br/>Evaluation: 1 period]
        Alarm2[🚨 DLQ Messages Alarm<br/>Metric: DLQ Messages Visible<br/>Threshold: ≥1 message<br/>Evaluation: 1 minute]
    end

    subgraph "Notification"
        SNS[📧 SNS Topic<br/>doc-processing-alerts]
        Email[📧 Email Subscribers]
        SMS[📱 SMS Subscribers]
    end

    FlowInvoker[λ Flow Invoker] -->|Errors| Alarm1
    DLQ[SQS DLQ] -->|Messages Visible| Alarm2

    Alarm1 -->|Trigger| SNS
    Alarm2 -->|Trigger| SNS
    SNS -->|Send| Email
    SNS -->|Send| SMS

    style Alarm1 fill:#ff6b6b
    style Alarm2 fill:#ff6b6b
    style SNS fill:#ff9900
```

### Dead Letter Queue (DLQ)

```mermaid
sequenceDiagram
    participant EB as EventBridge
    participant Lambda as Lambda Function
    participant DLQ as SQS DLQ
    participant CW as CloudWatch Alarm
    participant SNS as SNS Topic
    participant Admin

    EB->>Lambda: Invoke
    Lambda->>Lambda: Processing fails
    Lambda-->>EB: Error
    EB->>Lambda: Retry (attempt 2)
    Lambda-->>EB: Error
    EB->>Lambda: Retry (attempt 3)
    Lambda-->>EB: Error
    Note over Lambda: Max retries reached
    Lambda->>DLQ: Send failed event
    DLQ->>CW: ApproximateNumberOfMessagesVisible = 1
    CW->>CW: Evaluate alarm threshold
    CW->>SNS: Trigger alarm action
    SNS->>Admin: Send alert (email/SMS)
    Admin->>DLQ: Inspect failed event
    Admin->>Lambda: Fix issue & redeploy
    Admin->>DLQ: Delete processed messages
```

**DLQ Configuration**:
- **Queue Name**: `lambda-dlq-{region}`
- **Retention**: 14 days
- **Encryption**: KMS with customer-managed key
- **Attached to**: Flow Creator, Flow Invoker, API Handler

### CloudTrail Audit Logging

```mermaid
graph TB
    subgraph "CloudTrail Trail"
        Trail[📋 CloudTrail<br/>File validation: Enabled<br/>Global events: Enabled<br/>Multi-region: false<br/>Removal Policy: RETAIN]
    end

    subgraph "Monitored Services"
        S3Events[S3 API Calls<br/>PutObject, GetObject]
        DDBEvents[DynamoDB API Calls<br/>PutItem, Query, Scan]
        LambdaEvents[Lambda API Calls<br/>Invoke]
        BedrockEvents[Bedrock API Calls<br/>InvokeFlow, InvokeModel]
        IAMEvents[IAM API Calls<br/>AssumeRole]
    end

    subgraph "Audit Storage"
        TrailBucket[S3 Bucket<br/>CloudTrail Logs<br/>Auto-created<br/>SSE-S3 Encrypted]
    end

    S3Events -->|Log| Trail
    DDBEvents -->|Log| Trail
    LambdaEvents -->|Log| Trail
    BedrockEvents -->|Log| Trail
    IAMEvents -->|Log| Trail

    Trail -->|Store| TrailBucket

    style Trail fill:#90EE90
    style TrailBucket fill:#ff9900
```

---

## Disaster Recovery

### Current Architecture Limitations

**Important**: The current architecture does **NOT** implement multi-region disaster recovery as described in the incorrect documentation. Here are the facts:

```mermaid
graph TB
    subgraph "Primary Region: us-west-2 ONLY"
        App[Application Stack<br/>ALL resources deployed here]
        DDB[(DynamoDB<br/>Single-region table<br/>NO global table)]
        S3[(S3 Bucket<br/>Versioned<br/>NO cross-region replication)]
        OpenSearch[(OpenSearch<br/>VPC-attached<br/>Single region)]
        Lambda[Lambda Functions<br/>us-west-2 only]
    end

    subgraph "DR Region: us-east-2"
        Empty[❌ NO RESOURCES<br/>No standby infrastructure<br/>No data replication]
    end

    App --> DDB
    App --> S3
    App --> OpenSearch
    App --> Lambda

    style Empty fill:#ff6b6b
    style DDB fill:#ff9900
    style S3 fill:#ff9900
```

### What's Missing for DR

| Resource | Current State | DR Requirement | Effort |
|----------|---------------|----------------|--------|
| **DynamoDB** | Single-region table | Global table with replica in us-east-2 | Medium - Enable global tables |
| **S3 Bucket** | Versioned, no CRR | Enable cross-region replication to us-east-2 | Low - Configure replication rule |
| **OpenSearch** | Single domain in VPC | Cross-region snapshot restore or separate domain | High - Manual restore process |
| **Lambda Functions** | us-west-2 only | Deploy stack to us-east-2 | Medium - CDK deploy to second region |
| **API Gateway** | us-west-2 only | Multi-region with Route 53 failover | Medium - Route 53 health checks |
| **Bedrock Flow** | us-west-2 only | Recreate flow in us-east-2 | Medium - Custom resource in DR region |

### Recommended DR Implementation

To achieve **RPO < 1 hour** and **RTO < 4 hours**, implement:

```mermaid
graph TB
    subgraph "Primary Region: us-west-2"
        PrimaryApp[Application Stack]
        PrimaryDDB[(DynamoDB Global Table<br/>Primary)]
        PrimaryS3[S3 Bucket<br/>CRR Enabled]
    end

    subgraph "DR Region: us-east-2"
        DRApp[Application Stack<br/>Standby mode]
        DRDDB[(DynamoDB Global Table<br/>Replica<br/>Auto-sync)]
        DRS3[S3 Bucket<br/>Replication Target]
    end

    subgraph "Route 53"
        Route53[Route 53<br/>Health Checks<br/>Failover Routing]
    end

    PrimaryDDB -.->|Continuous Replication| DRDDB
    PrimaryS3 -.->|CRR| DRS3

    Route53 -->|Primary| PrimaryApp
    Route53 -.->|Failover| DRApp

    style PrimaryApp fill:#90EE90
    style DRApp fill:#ff9900
    style Route53 fill:#87CEEB
```

**Implementation Steps**:
1. **Convert DynamoDB to Global Table**: `aws dynamodb update-table --global-table-create`
2. **Enable S3 CRR**: Configure replication rule to us-east-2 bucket
3. **Deploy DR Stack**: `cdk deploy --region us-east-2 --context mode=dr`
4. **Configure Route 53**: Health checks + failover routing policy
5. **Test Failover**: Scheduled DR drills quarterly

### Backup Strategy

**Current Backups** (Automatic):
- **DynamoDB**: Point-in-time recovery (PITR) enabled, 35-day retention
- **S3**: Versioning enabled, lifecycle transitions to Glacier (90 days)
- **OpenSearch**: Automated snapshots (daily, 14-day retention)
- **CloudTrail**: Logs retained in S3 (RETAIN policy)

**RTO/RPO Current State**:
- **RTO**: > 24 hours (manual rebuild from backups)
- **RPO**: < 24 hours (DynamoDB PITR, S3 versioning)

---

## Cost Optimization

### Current Architecture Costs

**Estimated Monthly Costs** (us-west-2, moderate usage):

| Service | Configuration | Est. Cost |
|---------|---------------|-----------|
| **Lambda** | 1M invocations/month, 512 MB, 5s avg | $20 |
| **OpenSearch** | 2x t3.small.search, 20 GB EBS | $120 |
| **DynamoDB** | Pay-per-request, 1M reads, 100K writes | $30 |
| **S3** | 100 GB storage, 10K uploads, 100K downloads | $10 |
| **NAT Gateway** | 1 gateway, 100 GB data transfer | $50 |
| **API Gateway** | 1M requests | $3.50 |
| **Bedrock Flow** | 1K invocations, Claude Sonnet 3 | $15 |
| **CloudWatch** | Logs, metrics, alarms | $10 |
| **KMS** | 1 key, 10K API calls | $2 |
| **EventBridge** | 1M events | $1 |
| **SNS** | 1K notifications | $0.50 |
| **SQS** | DLQ (minimal usage) | $0.50 |
| **CloudTrail** | 1 trail, 10K events | $2 |
| **Total** | | **~$264/month** |

**Largest Cost Drivers**:
1. **OpenSearch** (45% of total) - Consider switching to OpenSearch Serverless
2. **NAT Gateway** (19% of total) - Single gateway for cost optimization
3. **Lambda** (8% of total) - Optimize cold starts and memory allocation

### Cost Optimization Opportunities

1. **OpenSearch Serverless**: Reduce costs by 30-40% for intermittent workloads
2. **DynamoDB Reserved Capacity**: If traffic is predictable, save 50-75%
3. **S3 Intelligent Tiering**: Automatic cost optimization for infrequent access
4. **Lambda Provisioned Concurrency**: Eliminate cold starts for critical paths
5. **CloudWatch Logs Retention**: Reduce from 90 days to 30 days

---

## Deployment Architecture

### CDK Stack Structure

```mermaid
graph TB
    subgraph "CDK App"
        App[intelligent-doc-processor]
    end

    subgraph "Stack: IntelligentDocProcessorStack"
        KMS[KMS Key]
        DLQ[SQS DLQ]
        Trail[CloudTrail]
        S3[S3 Documents Bucket]
        DDB[DynamoDB Table]
        VPC[VPC + Subnets]
        OpenSearch[OpenSearch Domain]
        FlowCreatorLambda[Flow Creator Lambda]
        FlowProvider[Custom Resource Provider]
        FlowResource[Bedrock Flow Custom Resource]
        FlowInvokerLambda[Flow Invoker Lambda]
        EventBridgeRule[EventBridge Rule]
        APIHandlerLambda[API Handler Lambda]
        APIGateway[API Gateway]
        SNS[SNS Topic]
        Alarms[CloudWatch Alarms]
        Dashboard[CloudWatch Dashboard]
    end

    App --> KMS
    KMS --> DLQ
    KMS --> S3
    KMS --> DDB
    KMS --> OpenSearch
    DLQ --> FlowCreatorLambda
    DLQ --> FlowInvokerLambda
    DLQ --> APIHandlerLambda
    FlowCreatorLambda --> FlowProvider
    FlowProvider --> FlowResource
    S3 --> EventBridgeRule
    EventBridgeRule --> FlowInvokerLambda
    FlowInvokerLambda --> FlowResource
    APIHandlerLambda --> APIGateway
    APIGateway --> APIHandlerLambda
    Alarms --> SNS
    Dashboard --> FlowInvokerLambda
    Dashboard --> APIGateway
    Dashboard --> DLQ

    style FlowResource fill:#ff6b9d
    style KMS fill:#ffcc00
```

### Deployment Steps

1. **Bootstrap CDK** (first time only):
   ```bash
   cd intelligent-doc-processor/backend
   cdk bootstrap aws://ACCOUNT-ID/us-west-2
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Synthesize CloudFormation**:
   ```bash
   cdk synth
   ```

4. **Deploy Stack**:
   ```bash
   cdk deploy
   ```

5. **Verify Deployment**:
   ```bash
   # Get outputs
   aws cloudformation describe-stacks \
     --stack-name IntelligentDocProcessorStack \
     --query 'Stacks[0].Outputs'
   ```

6. **Test API**:
   ```bash
   # Health check (no auth required)
   curl https://API_ID.execute-api.us-west-2.amazonaws.com/prod/health
   ```

### Stack Outputs

| Output | Description | Usage |
|--------|-------------|-------|
| `DocumentsBucketName` | S3 bucket name | Upload documents here |
| `APIEndpoint` | API Gateway URL | Base URL for API calls |
| `FlowId` | Bedrock Flow ID | Used by Flow Invoker Lambda |
| `DashboardName` | CloudWatch Dashboard name | View metrics |
| `CloudTrailArn` | CloudTrail ARN | Audit logging |
| `DLQQueueUrl` | Dead letter queue URL | Check failed events |
| `VPCId` | VPC ID | Network configuration |
| `OpenSearchVpcEndpoint` | OpenSearch endpoint | VPC-only access |

---

## Appendix: Comparison with Incorrect Architecture

### What Was Wrong

| Incorrect Documentation | Actual Implementation |
|------------------------|----------------------|
| Step Functions state machine | **No Step Functions** - Uses Bedrock Flow |
| Cognito User Pool authentication | **No Cognito** - Uses IAM authentication |
| 6+ Lambda functions (duplicate-check, textract-start, textract-status, comprehend-analyze, bedrock-summarize, store-metadata) | **Only 3 Lambda functions** (flow-creator, flow-invoker, api-handler) |
| Separate upload/search/metadata Lambdas | **1 consolidated API Handler** |
| Hash Registry DynamoDB table | **Not implemented** |
| Global table replication to us-east-2 | **No DR replication** |
| CloudFront + S3 frontend | **No frontend in backend stack** |
| Textract/Comprehend invoked by Lambda | **Orchestrated by Bedrock Flow** (not yet implemented in flow) |

### Why Bedrock Flows Instead of Step Functions

**Advantages**:
- Native integration with Bedrock models (Claude)
- Prompt-based orchestration
- No need to manage state machine JSON
- Built-in retry and error handling
- Streaming support for LLM responses

**Trade-offs**:
- Less visibility into execution steps (no visual state machine in console)
- Newer service with less tooling
- Requires custom resource for creation (not native CDK construct yet)

---

## References

- [AWS Bedrock Flows Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/flows.html)
- [Amazon Bedrock Flows Samples](https://github.com/aws-samples/amazon-bedrock-flows-samples)
- [AWS CDK API Reference](https://docs.aws.amazon.com/cdk/api/v2/)
- [OpenSearch in VPC](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/vpc.html)
- [DynamoDB Global Tables](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GlobalTables.html)

---

**Document Version**: 1.0  
**Last Verified**: November 12, 2025  
**CDK Version**: 2.x  
**Node.js Version**: 20.x

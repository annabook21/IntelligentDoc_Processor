# Architecture Documentation

This document provides detailed architecture diagrams for the Intelligent Document Processing Pipeline.

## Table of Contents
- [System Architecture](#system-architecture)
- [Step Functions Workflow](#step-functions-workflow)
- [Data Flow](#data-flow)
- [Component Details](#component-details)
- [Disaster Recovery](#disaster-recovery)
- [Security Architecture](#security-architecture)

## System Architecture

### Complete System Overview

```mermaid
graph TB
    subgraph "Client Layer"
        User[👤 User]
        Browser[Web Browser]
    end

    subgraph "CDN & Authentication"
        CF[☁️ CloudFront<br/>CDN Distribution]
        S3Web[📦 S3 Frontend Bucket<br/>Static Website]
        Cognito[🔐 Cognito User Pool<br/>Authentication]
    end

    subgraph "API Layer"
        APIGW[🌐 API Gateway<br/>REST API<br/>/upload, /search, /metadata]
        CogAuth[🔒 Cognito Authorizer]
        
        subgraph "API Lambdas"
            UploadLambda[λ Upload Handler<br/>Generate Presigned URLs]
            SearchLambda[λ Search Handler<br/>Query DynamoDB]
        end
    end

    subgraph "Document Storage"
        S3Docs[📦 S3 Documents Bucket<br/>KMS Encrypted<br/>Lifecycle Policies]
        KMS1[🔑 KMS Key<br/>Encryption]
    end

    subgraph "Event Processing"
        EB[⚡ EventBridge<br/>S3 Event Router]
        SFN[🔄 Step Functions<br/>State Machine<br/>Document Processor]
    end

    subgraph "Processing Lambdas"
        L1[λ Duplicate Check<br/>SHA-256 Hashing]
        L2[λ Textract Start<br/>Async Job Initiation]
        L3[λ Textract Status<br/>Job Polling]
        L4[λ Comprehend Analyze<br/>Language & Entities]
        L5[λ Bedrock Summarize<br/>AI Enrichment]
        L6[λ Store Metadata<br/>DynamoDB Write]
    end

    subgraph "AWS AI Services"
        Textract[📄 Amazon Textract<br/>Text Extraction<br/>OCR]
        Comprehend[🔍 Amazon Comprehend<br/>NLP<br/>Language Detection<br/>Entity Extraction]
        Bedrock[🤖 Amazon Bedrock<br/>Claude Sonnet 4.5<br/>Summarization]
    end

    subgraph "Data Layer - Primary Region us-west-2"
        DDB1[(💾 DynamoDB<br/>Metadata Table<br/>Global Table)]
        Hash1[(💾 DynamoDB<br/>Hash Registry<br/>Global Table)]
        GSI1[📊 GSI: LanguageIndex<br/>language + processingDate]
    end

    subgraph "Data Layer - DR Region us-east-2"
        DDB2[(💾 DynamoDB<br/>Metadata Replica<br/>Auto-sync)]
        Hash2[(💾 DynamoDB<br/>Hash Registry Replica<br/>Auto-sync)]
    end

    subgraph "Monitoring & Error Handling"
        CW[📊 CloudWatch<br/>Logs & Metrics]
        CWDash[📈 CloudWatch Dashboard<br/>Visualization]
        Alarms[🚨 CloudWatch Alarms<br/>Notifications]
        DLQ[📮 SQS Dead Letter Queue<br/>Failed Jobs]
        SNS[📧 SNS Topic<br/>Email/SMS Alerts]
    end

    User -->|HTTPS| Browser
    Browser -->|Request| CF
    CF -->|Serve Static| S3Web
    Browser -->|API Call| APIGW
    
    APIGW -->|Verify Token| CogAuth
    CogAuth -->|Validate| Cognito
    Browser -.->|Sign In| Cognito
    
    APIGW -->|/upload| UploadLambda
    APIGW -->|/search, /metadata| SearchLambda
    
    UploadLambda -->|Generate URL| S3Docs
    SearchLambda -->|Query| DDB1
    DDB1 -->|Use Index| GSI1
    
    S3Docs -->|Object Created| EB
    S3Docs -.->|Encrypted with| KMS1
    EB -->|Trigger| SFN
    
    SFN -->|1| L1
    L1 -->|Check/Store| Hash1
    L1 -.->|If Duplicate| L6
    L1 -->|If New| L2
    
    L2 -->|Start Job| Textract
    SFN -->|2| L3
    L3 -->|Poll Status| Textract
    L3 -->|3| L4
    
    L4 -->|Detect Language| Comprehend
    L4 -->|Extract Entities| Comprehend
    L4 -->|Extract Phrases| Comprehend
    L4 -->|4| L5
    
    L5 -->|Generate Summary| Bedrock
    L5 -->|Extract Insights| Bedrock
    L5 -->|5| L6
    
    L6 -->|Write| DDB1
    
    DDB1 -.->|Replicate| DDB2
    Hash1 -.->|Replicate| Hash2
    
    SFN -->|On Error| DLQ
    DLQ -->|Trigger| Alarms
    Alarms -->|Notify| SNS
    
    L1 -->|Logs| CW
    L2 -->|Logs| CW
    L3 -->|Logs| CW
    L4 -->|Logs| CW
    L5 -->|Logs| CW
    L6 -->|Logs| CW
    SFN -->|Execution Logs| CW
    
    CW -->|Aggregate| CWDash
    CW -->|Evaluate| Alarms

    style User fill:#e1f5ff
    style S3Docs fill:#ff9900
    style S3Web fill:#ff9900
    style SFN fill:#e7157b
    style DDB1 fill:#527fff
    style DDB2 fill:#527fff
    style Hash1 fill:#527fff
    style Hash2 fill:#527fff
    style Textract fill:#ff9900
    style Comprehend fill:#ff9900
    style Bedrock fill:#ff9900
    style DLQ fill:#ff6b6b
    style Cognito fill:#dd344c
```

## Step Functions Workflow

### State Machine Execution Flow

```mermaid
stateDiagram-v2
    [*] --> PrepareInput: S3 Object Created Event

    PrepareInput: Prepare Input
    note right of PrepareInput
        Extract:
        - bucket name
        - object key
        - region
    end note

    PrepareInput --> CheckDuplicate

    CheckDuplicate: Check Duplicate
    note right of CheckDuplicate
        Lambda: check-duplicate
        - Compute SHA-256 hash
        - Check hash registry
        - Store if new
    end note

    CheckDuplicate --> IsDuplicateChoice: Evaluate Result

    state IsDuplicateChoice <<choice>>
    IsDuplicateChoice --> StoreDuplicateMetadata: isDuplicate = true
    IsDuplicateChoice --> StartTextractJob: isDuplicate = false

    StoreDuplicateMetadata: Store Duplicate Metadata
    note right of StoreDuplicateMetadata
        Lambda: store-metadata
        - Store minimal metadata
        - Reference original document
        - Status: DUPLICATE
    end note

    StoreDuplicateMetadata --> ProcessingSucceeded

    StartTextractJob: Start Textract Job
    note right of StartTextractJob
        Lambda: textract-start
        - StartDocumentTextDetection
        - Return jobId
    end note

    StartTextractJob --> WaitForTextract

    WaitForTextract: Wait for Textract
    note right of WaitForTextract
        Wait 10 seconds
        (Allow async job to process)
    end note

    WaitForTextract --> GetTextractStatus

    GetTextractStatus: Get Textract Status
    note right of GetTextractStatus
        Lambda: textract-status
        - GetDocumentTextDetection
        - Check job status
        - Extract text if complete
    end note

    GetTextractStatus --> TextractStatusChoice: Check Status

    state TextractStatusChoice <<choice>>
    TextractStatusChoice --> WaitForTextract: IN_PROGRESS
    TextractStatusChoice --> AnalyzeComprehend: SUCCEEDED
    TextractStatusChoice --> TextractFailed: FAILED

    AnalyzeComprehend: Analyze with Comprehend
    note right of AnalyzeComprehend
        Lambda: comprehend-analyze
        - Detect language
        - Extract entities
        - Extract key phrases
    end note

    AnalyzeComprehend --> SummarizeBedrock

    SummarizeBedrock: Summarize with Bedrock
    note right of SummarizeBedrock
        Lambda: bedrock-summarize
        - Generate summary (2-3 sentences)
        - Extract key insights
        - Extract structured data
        - Model: Claude Sonnet 4.5
    end note

    SummarizeBedrock --> StoreMetadata

    StoreMetadata: Store Metadata
    note right of StoreMetadata
        Lambda: store-metadata
        - Write to DynamoDB
        - All extracted metadata
        - Status: PROCESSED
    end note

    StoreMetadata --> ProcessingSucceeded

    ProcessingSucceeded: Processing Succeeded
    ProcessingSucceeded --> [*]

    TextractFailed: Textract Failed
    note right of TextractFailed
        Log error to CloudWatch
        Send to DLQ
    end note
    TextractFailed --> [*]
```

### Step Functions Error Handling

```mermaid
graph TD
    Lambda[Lambda Execution] -->|Success| Continue[Continue Workflow]
    Lambda -->|Retry-able Error| Retry{Retry Logic}
    Lambda -->|Non-retry-able| Failed[Mark as Failed]
    
    Retry -->|Attempt 1-3| Lambda
    Retry -->|Max Retries| Failed
    
    Failed -->|Send Message| DLQ[Dead Letter Queue]
    DLQ -->|Trigger| Alarm[CloudWatch Alarm]
    Alarm -->|Notify| SNS[SNS Topic]
    SNS -->|Alert| Admin[Administrator]
    
    Continue -->|Next Step| NextLambda[Next Lambda Function]
    
    style DLQ fill:#ff6b6b
    style Alarm fill:#ff9900
    style Failed fill:#ff6b6b
```

## Data Flow

### Document Upload Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant CloudFront
    participant Cognito
    participant APIGateway
    participant UploadLambda
    participant S3

    User->>Browser: Select file to upload
    Browser->>CloudFront: Request upload page
    CloudFront-->>Browser: Serve React app
    
    Browser->>Cognito: Authenticate user
    Cognito-->>Browser: Return ID token
    
    Browser->>APIGateway: POST /upload<br/>{fileName, fileType}<br/>Authorization: Bearer <token>
    APIGateway->>Cognito: Verify token
    Cognito-->>APIGateway: Token valid
    
    APIGateway->>UploadLambda: Invoke with request
    UploadLambda->>S3: Generate presigned URL
    S3-->>UploadLambda: Return presigned URL
    UploadLambda-->>APIGateway: {uploadUrl, key}
    APIGateway-->>Browser: Return presigned URL
    
    Browser->>S3: PUT file to presigned URL
    S3-->>Browser: 200 OK
    Browser->>User: Show success message
    
    Note over S3: Document stored,<br/>triggers EventBridge
```

### Document Processing Flow

```mermaid
sequenceDiagram
    participant S3
    participant EventBridge
    participant StepFunctions
    participant DupCheck as Duplicate Check
    participant HashDB as Hash Registry
    participant Textract
    participant Comprehend
    participant Bedrock
    participant DynamoDB

    S3->>EventBridge: Object Created event
    EventBridge->>StepFunctions: Start execution
    
    StepFunctions->>DupCheck: Invoke with bucket/key
    DupCheck->>S3: Download document
    S3-->>DupCheck: Return document bytes
    DupCheck->>DupCheck: Compute SHA-256 hash
    
    DupCheck->>HashDB: Check if hash exists
    
    alt Hash exists (duplicate)
        HashDB-->>DupCheck: Hash found
        DupCheck->>HashDB: Increment occurrence count
        DupCheck-->>StepFunctions: {isDuplicate: true, originalDocId}
        StepFunctions->>DynamoDB: Store duplicate metadata
        DynamoDB-->>StepFunctions: Success
    else New document
        HashDB-->>DupCheck: Hash not found
        DupCheck->>HashDB: Store new hash
        DupCheck-->>StepFunctions: {isDuplicate: false, hash}
        
        StepFunctions->>Textract: StartDocumentTextDetection
        Textract-->>StepFunctions: {jobId}
        
        loop Poll until complete
            StepFunctions->>StepFunctions: Wait 10 seconds
            StepFunctions->>Textract: GetDocumentTextDetection(jobId)
            Textract-->>StepFunctions: {status, text?}
        end
        
        StepFunctions->>Comprehend: DetectDominantLanguage(text)
        Comprehend-->>StepFunctions: {language}
        
        StepFunctions->>Comprehend: DetectEntities(text, language)
        Comprehend-->>StepFunctions: {entities}
        
        StepFunctions->>Comprehend: DetectKeyPhrases(text, language)
        Comprehend-->>StepFunctions: {keyPhrases}
        
        StepFunctions->>Bedrock: InvokeModel<br/>(Claude Sonnet 4.5)
        Bedrock-->>StepFunctions: {summary, insights, structuredData}
        
        StepFunctions->>DynamoDB: PutItem (all metadata)
        DynamoDB-->>StepFunctions: Success
    end
    
    Note over DynamoDB: Data replicates to<br/>DR region automatically
```

### Search Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant CloudFront
    participant APIGateway
    participant SearchLambda
    participant DynamoDB
    participant GSI as LanguageIndex GSI

    User->>Browser: Navigate to dashboard
    Browser->>CloudFront: Request dashboard
    CloudFront-->>Browser: Serve React app
    
    Browser->>APIGateway: GET /search<br/>Authorization: Bearer <token>
    APIGateway->>SearchLambda: Invoke
    SearchLambda->>DynamoDB: Scan (all documents)
    DynamoDB-->>SearchLambda: {documents[]}
    SearchLambda-->>APIGateway: {documents, count, limit, offset}
    APIGateway-->>Browser: Return JSON
    Browser->>Browser: Render visualizations
    Browser->>User: Display dashboard
    
    User->>Browser: Filter by language
    Browser->>APIGateway: GET /search?language=en
    APIGateway->>SearchLambda: Invoke with params
    SearchLambda->>GSI: Query LanguageIndex<br/>(language = 'en')
    GSI-->>SearchLambda: {documents[]}
    SearchLambda-->>APIGateway: {documents, count}
    APIGateway-->>Browser: Return JSON
    Browser->>User: Display filtered results
```

## Component Details

### Lambda Functions

```mermaid
graph LR
    subgraph "API Functions"
        Upload[Upload Handler<br/>30s timeout<br/>Presigned URLs]
        Search[Search Handler<br/>30s timeout<br/>DynamoDB queries]
    end
    
    subgraph "Processing Functions"
        DupCheck[Duplicate Check<br/>60s timeout<br/>SHA-256 hashing]
        TextStart[Textract Start<br/>30s timeout<br/>Async job init]
        TextStatus[Textract Status<br/>30s timeout<br/>Job polling]
        Comp[Comprehend Analyze<br/>30s timeout<br/>NLP analysis]
        BR[Bedrock Summarize<br/>45s timeout<br/>AI enrichment]
        Store[Store Metadata<br/>30s timeout<br/>DynamoDB write]
    end
    
    subgraph "Environment Variables"
        ENV1[DOCUMENTS_BUCKET<br/>KMS_KEY_ARN]
        ENV2[METADATA_TABLE_NAME]
        ENV3[HASH_TABLE_NAME]
        ENV4[BEDROCK_MODEL_ID]
    end
    
    Upload -.->|Uses| ENV1
    DupCheck -.->|Uses| ENV3
    Store -.->|Uses| ENV2
    BR -.->|Uses| ENV4
    
    style Upload fill:#90EE90
    style Search fill:#90EE90
    style DupCheck fill:#87CEEB
    style TextStart fill:#87CEEB
    style TextStatus fill:#87CEEB
    style Comp fill:#87CEEB
    style BR fill:#87CEEB
    style Store fill:#87CEEB
```

### DynamoDB Schema

```mermaid
erDiagram
    METADATA_TABLE {
        string documentId PK
        string processingDate SK
        string language
        string entities
        string keyPhrases
        string text
        number fullTextLength
        string summary
        string insights
        string structuredData
        string status
        string duplicateOf
        string contentHash
    }
    
    LANGUAGE_INDEX {
        string language PK
        string processingDate SK
        string documentId
    }
    
    HASH_REGISTRY {
        string contentHash PK
        string firstDocumentId
        string firstSeen
        string latestDocumentId
        string lastSeen
        number occurrences
    }
    
    METADATA_TABLE ||--o{ LANGUAGE_INDEX : "GSI"
    METADATA_TABLE }o--|| HASH_REGISTRY : "references"
```

## Disaster Recovery

### Multi-Region Replication

```mermaid
graph TB
    subgraph "Primary Region: us-west-2"
        App1[Application Stack]
        DDB1[(DynamoDB Table<br/>Metadata)]
        Hash1[(DynamoDB Table<br/>Hash Registry)]
        S3_1[S3 Bucket<br/>Documents]
    end
    
    subgraph "DR Region: us-east-2"
        DDB2[(DynamoDB Replica<br/>Read/Write Capable)]
        Hash2[(DynamoDB Replica<br/>Read/Write Capable)]
        S3_2[S3 Bucket<br/>Cross-Region Replication<br/>Optional]
    end
    
    App1 -->|Writes| DDB1
    App1 -->|Writes| Hash1
    App1 -->|Uploads| S3_1
    
    DDB1 -.->|Auto-Replicate<br/>Sub-second latency| DDB2
    Hash1 -.->|Auto-Replicate<br/>Sub-second latency| Hash2
    S3_1 -.->|Optional CRR| S3_2
    
    DDB2 -->|Available for<br/>Read/Write| DR_App[DR Application<br/>Can be deployed if needed]
    
    style DDB1 fill:#527fff
    style DDB2 fill:#527fff
    style Hash1 fill:#527fff
    style Hash2 fill:#527fff
    style S3_1 fill:#ff9900
    style S3_2 fill:#ff9900
```

### Failover Strategy

```mermaid
flowchart TD
    Start[Primary Region Failure Detected]
    Start --> Check{Health Check}
    
    Check -->|Unhealthy| Notify[Notify Operations Team]
    Notify --> Route53[Update Route 53 DNS<br/>Point to DR Region]
    
    Route53 --> DeployDR[Deploy Application Stack<br/>in DR Region]
    DeployDR --> ConfigDR[Configure to use<br/>DR DynamoDB Replicas]
    
    ConfigDR --> Verify[Verify Application Health]
    Verify -->|Success| Complete[DR Failover Complete]
    Verify -->|Failure| Rollback[Rollback & Investigate]
    
    Check -->|Healthy| Monitor[Continue Monitoring]
    Monitor --> Check
    
    style Start fill:#ff6b6b
    style Complete fill:#90EE90
    style Rollback fill:#ff9900
```

## Security Architecture

### Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant CloudFront
    participant Cognito
    participant APIGateway
    participant Lambda
    participant AWS Services

    User->>Browser: Access application
    Browser->>CloudFront: Request app
    CloudFront-->>Browser: Serve React app
    
    Browser->>Cognito: Initiate sign-in
    Note over Cognito: Hosted UI
    Cognito->>User: Prompt credentials
    User->>Cognito: Provide username/password
    
    Cognito->>Cognito: Verify credentials
    Cognito-->>Browser: Return tokens<br/>(ID, Access, Refresh)
    
    Browser->>APIGateway: API Request<br/>Authorization: Bearer <ID token>
    APIGateway->>Cognito: Validate token
    Cognito-->>APIGateway: Token valid + user info
    
    APIGateway->>Lambda: Invoke with user context
    Lambda->>Lambda: Check IAM permissions
    Lambda->>AWS Services: Access AWS resources
    AWS Services-->>Lambda: Return data
    Lambda-->>APIGateway: Return response
    APIGateway-->>Browser: JSON response
    Browser->>User: Display data
    
    Note over Browser,Cognito: Token expires after 1 hour
    Browser->>Cognito: Refresh token request
    Cognito-->>Browser: New ID token
```

### Encryption Architecture

```mermaid
graph TB
    subgraph "Data at Rest"
        S3[S3 Buckets<br/>SSE-KMS]
        DDB[DynamoDB Tables<br/>AWS Managed Keys]
        Lambda[Lambda Env Variables<br/>KMS Encrypted]
        EBS[Lambda /tmp<br/>Encrypted]
    end
    
    subgraph "Data in Transit"
        HTTPS[HTTPS/TLS 1.2+<br/>CloudFront → Browser]
        API_TLS[HTTPS/TLS 1.2+<br/>API Gateway]
        SDK[AWS SDK<br/>TLS to AWS Services]
    end
    
    subgraph "Key Management"
        KMS[AWS KMS<br/>Customer Managed Key]
        KMS_AWS[AWS Managed Keys<br/>DynamoDB]
    end
    
    KMS -->|Encrypts| S3
    KMS -->|Encrypts| Lambda
    KMS_AWS -->|Encrypts| DDB
    
    User[👤 User] -->|TLS| HTTPS
    HTTPS -->|TLS| API_TLS
    API_TLS -->|TLS| SDK
    
    style KMS fill:#ffcc00
    style KMS_AWS fill:#ffcc00
    style S3 fill:#90EE90
    style DDB fill:#90EE90
    style Lambda fill:#90EE90
```

### IAM Permissions Model

```mermaid
graph TD
    subgraph "Principle of Least Privilege"
        L1[Lambda: Duplicate Check] -->|Read/Write| Hash[Hash Registry Table]
        L1 -->|Read| S3_Doc[S3 Documents]
        
        L2[Lambda: Textract Start] -->|Read| S3_Doc
        L2 -->|StartTextExtraction| Textract[Textract Service]
        
        L3[Lambda: Textract Status] -->|GetTextExtraction| Textract
        
        L4[Lambda: Comprehend] -->|DetectLanguage<br/>DetectEntities<br/>DetectKeyPhrases| Comprehend[Comprehend Service]
        
        L5[Lambda: Bedrock] -->|InvokeModel| Bedrock[Bedrock Service]
        
        L6[Lambda: Store Metadata] -->|PutItem| Metadata[Metadata Table]
        
        L7[Lambda: Search] -->|Query<br/>Scan| Metadata
        
        L8[Lambda: Upload] -->|PutObject| S3_Doc
    end
    
    subgraph "Service-to-Service"
        Textract_Role[Textract Service] -->|GetObject| S3_Doc
        S3_Doc -->|EventBridge| EventBridge[EventBridge Service]
        EventBridge -->|StartExecution| SFN[Step Functions]
        SFN -->|Invoke| L1
        SFN -->|Invoke| L2
        SFN -->|Invoke| L3
        SFN -->|Invoke| L4
        SFN -->|Invoke| L5
        SFN -->|Invoke| L6
    end
    
    style L1 fill:#87CEEB
    style L2 fill:#87CEEB
    style L3 fill:#87CEEB
    style L4 fill:#87CEEB
    style L5 fill:#87CEEB
    style L6 fill:#87CEEB
    style L7 fill:#90EE90
    style L8 fill:#90EE90
```

## Monitoring Architecture

```mermaid
graph TB
    subgraph "Metric Sources"
        Lambda[Lambda Metrics<br/>Duration, Errors, Throttles]
        SFN[Step Functions<br/>Executions, Duration]
        API[API Gateway<br/>4XX, 5XX, Latency]
        DDB[DynamoDB<br/>Consumed Capacity]
        S3[S3<br/>Bucket Metrics]
    end
    
    subgraph "CloudWatch"
        Logs[CloudWatch Logs<br/>Centralized Logging]
        Metrics[CloudWatch Metrics<br/>Real-time Metrics]
        Dashboard[CloudWatch Dashboard<br/>Visualization]
    end
    
    subgraph "Alerting"
        Alarms[CloudWatch Alarms<br/>Threshold-based]
        SNS[SNS Topic<br/>Notifications]
        Email[📧 Email]
        SMS[📱 SMS]
        Slack[💬 Slack<br/>Optional Webhook]
    end
    
    Lambda -->|Stream| Logs
    SFN -->|Stream| Logs
    API -->|Publish| Metrics
    DDB -->|Publish| Metrics
    S3 -->|Publish| Metrics
    
    Logs -->|Aggregate| Dashboard
    Metrics -->|Visualize| Dashboard
    Metrics -->|Evaluate| Alarms
    
    Alarms -->|Trigger| SNS
    SNS -->|Send| Email
    SNS -->|Send| SMS
    SNS -.->|Webhook| Slack
    
    style Dashboard fill:#90EE90
    style Alarms fill:#ff9900
    style Email fill:#ff6b6b
```

---

**Note:** All diagrams are in Mermaid format and can be rendered in GitHub, GitLab, or any Mermaid-compatible viewer.


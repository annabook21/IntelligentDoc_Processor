# Disaster Recovery Architecture Diagram

## Multi-Region Deployment with DynamoDB Global Tables

### Mermaid Diagram (Paste into GitHub README or diagrams.net)

```mermaid
graph TB
    subgraph "Global"
        Users[👤 Users Worldwide]
        CF[☁️ CloudFront CDN<br/>d3ozz2yllseyw8.cloudfront.net<br/>Global Edge Locations]
    end
    
    subgraph "Primary Region: us-west-2 Oregon"
        subgraph "Frontend"
            S3F[📦 S3 Frontend Bucket<br/>doc-processor-frontend<br/>React Application]
            Cognito[🔐 Cognito User Pool<br/>us-west-2_dFwXN1Q3G<br/>Domain: idp-901916-uswe]
        end
        
        subgraph "API Layer"
            APIGW[🌐 API Gateway<br/>REST API<br/>Cognito Authorizer]
            UploadLambda[λ Upload Handler<br/>Presigned URLs]
            SearchLambda[λ Search Handler<br/>DynamoDB Query]
        end
        
        subgraph "Processing Pipeline"
            S3Docs[📦 S3 Documents<br/>intelligent-docs-*<br/>KMS Encrypted]
            EventBridge[📨 EventBridge<br/>S3 Events]
            StepFunctions[🔄 Step Functions<br/>doc-processing-us-west-2<br/>Orchestration]
            
            CheckDup[λ Check Duplicate<br/>SHA-256 Hash]
            TextractStart[λ Textract Start<br/>Async Job]
            TextractStatus[λ Textract Status<br/>Extract Text]
            Comprehend[λ Comprehend<br/>Entities & Language]
            Bedrock[λ Bedrock<br/>Claude Sonnet 4.5]
            StoreMetadata[λ Store Metadata<br/>DynamoDB Write]
        end
        
        subgraph "AI Services"
            Textract[🤖 Amazon Textract<br/>Text Extraction]
            ComprehendSvc[🧠 Amazon Comprehend<br/>NLP Analysis]
            BedrockSvc[🎨 Amazon Bedrock<br/>Foundation Models]
        end
        
        subgraph "Data Layer - Primary"
            DDB1[🗄️ Metadata Table<br/>document-metadata<br/>Global Table PRIMARY<br/>On-Demand Mode]
            DDB2[🗄️ Hash Registry<br/>document-hash-registry<br/>Global Table PRIMARY<br/>Duplicate Detection]
            DDB3[🗄️ Document Names<br/>document-names<br/>Global Table PRIMARY<br/>Quick Lookups]
        end
        
        subgraph "Monitoring"
            CW[📊 CloudWatch<br/>Dashboard & Logs]
            Alarms[🚨 Alarms<br/>SNS Notifications]
            DLQ[☠️ SQS DLQ<br/>Failed Jobs]
        end
    end
    
    subgraph "DR Region: us-east-2 Ohio"
        subgraph "Data Layer - DR Replicas"
            DDB1_DR[🗄️ Metadata Table<br/>REPLICA<br/>🛡️ Deletion Protection<br/>Read/Write Enabled]
            DDB2_DR[🗄️ Hash Registry<br/>REPLICA<br/>🛡️ Deletion Protection<br/>Read/Write Enabled]
            DDB3_DR[🗄️ Document Names<br/>REPLICA<br/>🛡️ Deletion Protection<br/>Read/Write Enabled]
        end
        
        Processing_DR[⏸️ Processing Pipeline<br/>STANDBY<br/>Deploy on failover]
    end
    
    Users -->|HTTPS| CF
    CF -->|Origin Request| S3F
    CF -->|API Calls| APIGW
    
    S3F -.->|Auth UI| Cognito
    APIGW -->|Validate Token| Cognito
    APIGW -->|/upload| UploadLambda
    APIGW -->|/search, /metadata| SearchLambda
    
    UploadLambda -->|Presigned URL| S3Docs
    SearchLambda -->|Query| DDB1
    
    S3Docs -->|ObjectCreated| EventBridge
    EventBridge -->|Trigger| StepFunctions
    
    StepFunctions -->|1| CheckDup
    CheckDup -->|Lookup| DDB2
    CheckDup -->|If New| TextractStart
    CheckDup -->|If Duplicate| StoreMetadata
    
    TextractStart -->|Start Job| Textract
    StepFunctions -->|2| TextractStatus
    TextractStatus -->|Poll Status| Textract
    TextractStatus -->|3| Comprehend
    
    Comprehend -->|Detect Language| ComprehendSvc
    Comprehend -->|Extract Entities| ComprehendSvc
    Comprehend -->|4| Bedrock
    
    Bedrock -->|Summarize| BedrockSvc
    Bedrock -->|5| StoreMetadata
    
    StoreMetadata -->|Write| DDB1
    StoreMetadata -->|Write| DDB3
    
    DDB1 -.->|Replication<br/><1 sec| DDB1_DR
    DDB2 -.->|Replication<br/><1 sec| DDB2_DR
    DDB3 -.->|Replication<br/><1 sec| DDB3_DR
    
    StepFunctions -->|Errors| DLQ
    StepFunctions -->|Logs| CW
    CW -->|Metrics| Alarms
    
    style Users fill:#e1f5ff
    style CF fill:#f90
    style S3F fill:#f90
    style S3Docs fill:#f90
    style APIGW fill:#ff4f8b
    style StepFunctions fill:#e7157b
    style DDB1 fill:#527fff
    style DDB1_DR fill:#527fff
    style DDB2 fill:#527fff
    style DDB2_DR fill:#527fff
    style DDB3 fill:#527fff
    style DDB3_DR fill:#527fff
    style Textract fill:#f90
    style ComprehendSvc fill:#f90
    style BedrockSvc fill:#f90
    style DLQ fill:#ff6b6b
    style Processing_DR fill:#ccc,stroke-dasharray: 5 5
    style Cognito fill:#dd344c
```

## Simplified DR View

```mermaid
graph LR
    subgraph "us-west-2 PRIMARY"
        A[🖥️ Active Processing]
        B[🗄️ DynamoDB<br/>Global Tables<br/>Read + Write]
        A -->|Writes| B
    end
    
    B -.->|Sub-second<br/>Replication| C
    
    subgraph "us-east-2 DR"
        C[🗄️ DynamoDB<br/>Replicas<br/>Read + Write]
        D[⏸️ Standby<br/>Deploy on Failover]
    end
    
    style A fill:#4caf50
    style B fill:#527fff
    style C fill:#527fff
    style D fill:#ccc,stroke-dasharray: 5 5
```

## Data Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant CF as CloudFront
    participant S3 as S3 Bucket (us-west-2)
    participant EB as EventBridge
    participant SFN as Step Functions
    participant Lambda as Lambda Functions
    participant DDB_USW2 as DynamoDB (us-west-2)
    participant DDB_USE2 as DynamoDB (us-east-2)
    
    User->>CF: Upload document
    CF->>S3: Store document
    S3->>EB: ObjectCreated event
    EB->>SFN: Start execution
    
    SFN->>Lambda: 1. Check duplicate
    Lambda->>DDB_USW2: Query hash registry
    
    alt Document is new
        SFN->>Lambda: 2. Extract text (Textract)
        SFN->>Lambda: 3. Analyze (Comprehend)
        SFN->>Lambda: 4. Summarize (Bedrock)
        SFN->>Lambda: 5. Store metadata
        Lambda->>DDB_USW2: Write metadata
        
        Note over DDB_USW2,DDB_USE2: Automatic replication <1 sec
        DDB_USW2-->>DDB_USE2: Replicate data
    else Document is duplicate
        SFN->>Lambda: Store minimal metadata
        Lambda->>DDB_USW2: Write duplicate reference
        DDB_USW2-->>DDB_USE2: Replicate data
    end
    
    User->>CF: Search documents
    CF->>Lambda: Search request
    Lambda->>DDB_USW2: Query metadata
    DDB_USW2-->>Lambda: Return results
    Lambda-->>User: Display results
```

## Failover Workflow

```mermaid
stateDiagram-v2
    [*] --> Normal: System Running
    
    Normal --> DetectFailure: us-west-2 outage detected
    DetectFailure --> Assess: Check DR region health
    
    Assess --> VerifyData: Data intact?
    
    VerifyData --> DeployDR: ✅ Data intact
    VerifyData --> RestoreData: ❌ Data corrupted
    
    RestoreData --> PointInTime: Restore from PITR
    PointInTime --> DeployDR: Data restored
    
    DeployDR --> UpdateCF: Deploy stack to us-east-2
    UpdateCF --> UpdateDNS: Update CloudFront origin
    UpdateDNS --> CreateCognito: Create new Cognito pool
    CreateCognito --> MigrateUsers: Migrate user accounts
    MigrateUsers --> ValidateSystem: Test functionality
    
    ValidateSystem --> Operational: ✅ System online
    ValidateSystem --> Troubleshoot: ❌ Issues detected
    
    Troubleshoot --> ValidateSystem: Fix and retry
    
    Operational --> Monitor: Monitor DR region
    Monitor --> Failback: us-west-2 recovered
    
    Failback --> DeployPrimary: Redeploy to us-west-2
    DeployPrimary --> SyncData: Verify data consistency
    SyncData --> UpdateCFPrimary: Revert CloudFront origin
    UpdateCFPrimary --> Normal: Resume normal operations
    
    Normal --> [*]: System stable
```

## AWS Well-Architected Framework Alignment

### Reliability Pillar

| Principle | Implementation | Status |
|-----------|---------------|--------|
| **Backup and Restore** | DynamoDB PITR (35 days), S3 versioning | ✅ |
| **Multi-AZ Deployment** | DynamoDB, Lambda, API Gateway | ✅ |
| **Multi-Region** | DynamoDB Global Tables | ✅ |
| **Change Management** | IaC (CDK), version control | ✅ |
| **Failure Monitoring** | CloudWatch, Alarms, DLQ | ✅ |
| **Automated Recovery** | Step Functions retry logic | ✅ |
| **Test Recovery** | Quarterly DR drills | 📋 Recommended |

### Performance Efficiency Pillar

| Principle | Implementation | Status |
|-----------|---------------|--------|
| **Serverless** | Lambda, DynamoDB On-Demand | ✅ |
| **Parallel Processing** | Step Functions + Lambda | ✅ |
| **Global Distribution** | CloudFront Edge Caching | ✅ |
| **Data Locality** | Regional DynamoDB replicas | ✅ |
| **Monitoring** | CloudWatch Dashboard | ✅ |

### Security Pillar

| Principle | Implementation | Status |
|-----------|---------------|--------|
| **Identity Management** | Cognito, IAM | ✅ |
| **Data Protection** | KMS encryption, TLS | ✅ |
| **Network Protection** | Private S3, API auth | ✅ |
| **Logging** | CloudWatch, CloudTrail | ✅ |
| **Deletion Protection** | DynamoDB DR tables | ✅ |

### Cost Optimization Pillar

| Principle | Implementation | Status |
|-----------|---------------|--------|
| **Right-sizing** | Lambda memory optimization | ✅ |
| **Lifecycle Management** | S3 → Glacier → Deep Archive | ✅ |
| **Duplicate Detection** | Avoid redundant processing | ✅ |
| **On-Demand Capacity** | DynamoDB auto-scaling | ✅ |

---

## Quick Start Guide for Diagram Creation

### Using draw.io (Recommended)

1. **Open draw.io**: https://app.diagrams.net/
2. **Enable AWS icon set**:
   - Click **Extras** → **Configuration**
   - Paste AWS icon library URL or search "AWS" in shape search
3. **Create new diagram**: Blank diagram
4. **Add shapes** following the architecture above:
   - Drag and drop AWS icons
   - Use rectangles for regions/subgraphs
   - Use arrows for data flow
   - Use dashed lines for replication
5. **Color coding**:
   - Blue: Primary region resources
   - Orange: DR region resources
   - Green: Active/healthy
   - Red: Alerts/DLQ
   - Gray: Standby/inactive
6. **Export**: File → Export as → PNG/SVG/PDF

### Using Mermaid (Embedded in Markdown)

The diagrams above can be embedded directly in GitHub README files. Just paste the code blocks starting with ` ```mermaid` and they'll render automatically!

### Using AWS Application Composer

1. Open AWS Console → Application Composer
2. Click **Create project**
3. Click **Template** tab
4. Paste the CloudFormation template from `cdk.out/SimplifiedDocProcessorStackV3.template.json`
5. Visual diagram will auto-generate
6. Export as PNG

---

**Pro Tip:** For presentations, use draw.io with AWS official icons. For documentation, use Mermaid (renders on GitHub automatically). For technical deep-dives, use the text-based ASCII diagrams in MULTI_REGION_ARCHITECTURE.md.


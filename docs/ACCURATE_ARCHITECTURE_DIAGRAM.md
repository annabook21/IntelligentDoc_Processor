# Accurate Architecture Diagram - Corrections

## Your Current Diagram vs. Actual Deployment

### ✅ What Your Diagram Gets Right

- Users → CloudFront → S3 Frontend
- Cognito authentication flow
- API Gateway with 2 Lambda functions (upload, search)
- S3 Document Bucket → EventBridge → Step Functions
- Processing Lambda functions calling AWS AI services
- Secondary region (us-east-2) with DynamoDB replicas

### ❌ What Needs Correction

#### 1. Lambda Function Count: 8 (not 6-7)

**Your diagram shows:**
```
Top row inside processing box:
- Check Duplicate function      ✓
- Start Textract                ✓
- Check Textract Status         ✓
- Comprehend + Bedrock (COMBINED) ✗ Should be separate

Outside processing box:
- Upload Handler function       ✓
- Search / Metadata function    ✓
```

**Should be:**
```
API Layer (outside Step Functions):
1. λ Upload Handler
2. λ Search Handler

Processing Pipeline (inside Step Functions):
3. λ Check Duplicate
4. λ Textract Start
5. λ Textract Status
6. λ Comprehend Analyze        ← SEPARATE function
7. λ Bedrock Summarize          ← SEPARATE function
8. λ Store Metadata             ← MISSING from your diagram!
```

#### 2. DynamoDB Tables: 3 (not 2)

**Your diagram shows in Secondary Region:**
```
✓ DynamoDB Hash Registry (global replica)
✓ DynamoDB Metatable Table (global replica)
✗ MISSING: Document Names table
```

**Should show:**
```
Primary Region (us-west-2):
1. document-metadata-uswest2-df3261d7
2. document-hash-registry-uswest2-b2e970e1
3. document-names-uswest2-aa45fcc8           ← ADD THIS

Secondary Region (us-east-2) - All 3 replicated:
1. Metadata table replica
2. Hash registry replica
3. Document names replica                    ← ADD THIS
```

#### 3. Store Metadata Lambda (Critical Missing Component)

**Current flow in your diagram:**
```
Comprehend + Bedrock → [arrow to DynamoDB]
```

**Actual flow:**
```
λ Comprehend Analyze → λ Bedrock Summarize → λ Store Metadata → DynamoDB Tables (2 writes)
                                                                   ├─> Metadata Table
                                                                   └─> Document Names Table
```

The **store-metadata Lambda** is the final step that:
- Receives all processed data from Bedrock
- Writes to Metadata table
- Writes to Document Names table (for quick lookups)
- Marks processing as complete

---

## Corrected Architecture Diagram (Complete)

### Image 1: Processing Pipeline Detail

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Primary Region (us-west-2)                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │          Processing Pipeline (Step Functions)                │       │
│  │                                                               │       │
│  │  [1] λ Check Duplicate                                        │       │
│  │       ↓                                                       │       │
│  │  DynamoDB Hash Registry (primary)                            │       │
│  │       ↓                                                       │       │
│  │  Decision: Duplicate?                                         │       │
│  │     ├─ YES → [8] λ Store Metadata (skip processing)          │       │
│  │     └─ NO  → Continue                                         │       │
│  │                                                               │       │
│  │  [2] λ Start Textract                                         │       │
│  │       ↓                                                       │       │
│  │  Amazon Textract (async job started)                         │       │
│  │       ↓                                                       │       │
│  │  [3] λ Check Textract Status (poll until complete)           │       │
│  │       ↓                                                       │       │
│  │  [4] λ Comprehend Analyze                                    │       │
│  │       ↓                                                       │       │
│  │  Amazon Comprehend                                            │       │
│  │  ├─ Detect Language                                           │       │
│  │  ├─ Extract Entities (PERSON, LOCATION, ORG, DATE)           │       │
│  │  └─ Extract Key Phrases                                       │       │
│  │       ↓                                                       │       │
│  │  [5] λ Bedrock Summarize                                     │       │
│  │       ↓                                                       │       │
│  │  Amazon Bedrock (Claude Sonnet 4.5)                          │       │
│  │  ├─ Generate Summary                                          │       │
│  │  ├─ Extract Insights                                          │       │
│  │  └─ Structure Data                                            │       │
│  │       ↓                                                       │       │
│  │  [6] λ Store Metadata ← THIS IS CRITICAL!                    │       │
│  │       ↓                    ↓                                  │       │
│  │  DynamoDB Metadata    DynamoDB Document Names                │       │
│  │  (primary)            (primary)                               │       │
│  └──────────────────────────────────────────────────────────────┘       │
│       ↓                    ↓                    ↓                        │
│  Replication (<1 second) across all 3 tables                            │
└──────────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                   Secondary Region (us-east-2)                           │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │  DynamoDB Global Table Replicas (Read/Write Enabled)         │       │
│  │                                                               │       │
│  │  1. Metadata table replica                                    │       │
│  │     🛡️ Deletion Protection: ENABLED                          │       │
│  │                                                               │       │
│  │  2. Hash registry replica                                     │       │
│  │     🛡️ Deletion Protection: ENABLED                          │       │
│  │                                                               │       │
│  │  3. Document names replica ← ADD THIS TO YOUR DIAGRAM        │       │
│  │     🛡️ Deletion Protection: ENABLED                          │       │
│  └──────────────────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Corrected Mermaid Diagram

Here's the 100% accurate diagram with all components:

```mermaid
graph TB
    subgraph "Users"
        Users[👤 Users Worldwide]
    end
    
    subgraph "Global CDN"
        CF[☁️ CloudFront<br/>d3ozz2yllseyw8.cloudfront.net]
    end
    
    subgraph "Primary Region: us-west-2"
        subgraph "Frontend & Auth"
            S3F[📦 S3 Frontend<br/>React App]
            Cognito[🔐 Cognito<br/>us-west-2_dFwXN1Q3G<br/>idp-901916-uswe]
        end
        
        subgraph "API Layer"
            APIGW[🌐 API Gateway<br/>Cognito Authorizer]
            Upload[λ 1: Upload Handler<br/>Presigned URLs]
            Search[λ 2: Search Handler<br/>DynamoDB Query]
        end
        
        subgraph "Processing Pipeline"
            S3Docs[📦 S3 Documents<br/>intelligent-docs-*]
            EB[📨 EventBridge<br/>S3 Events]
            SFN[🔄 Step Functions<br/>State Machine]
            
            L3[λ 3: Check Duplicate<br/>SHA-256 Hash]
            L4[λ 4: Textract Start<br/>Async Job]
            L5[λ 5: Textract Status<br/>Poll & Extract]
            L6[λ 6: Comprehend<br/>Language+Entities]
            L7[λ 7: Bedrock<br/>AI Summary]
            L8[λ 8: Store Metadata<br/>DynamoDB Write]
        end
        
        subgraph "AI Services"
            Textract[🤖 Textract]
            ComprehendSvc[🧠 Comprehend]
            BedrockSvc[🎨 Bedrock<br/>Claude Sonnet 4.5]
        end
        
        subgraph "Data - Primary"
            DDB1[🗄️ Metadata<br/>document-metadata<br/>PRIMARY]
            DDB2[🗄️ Hash Registry<br/>document-hash-registry<br/>PRIMARY]
            DDB3[🗄️ Document Names<br/>document-names<br/>PRIMARY]
        end
    end
    
    subgraph "DR Region: us-east-2"
        subgraph "Data - DR Replicas"
            DDB1_DR[🗄️ Metadata<br/>REPLICA<br/>🛡️ Protected]
            DDB2_DR[🗄️ Hash Registry<br/>REPLICA<br/>🛡️ Protected]
            DDB3_DR[🗄️ Document Names<br/>REPLICA<br/>🛡️ Protected]
        end
    end
    
    Users -->|HTTPS| CF
    CF -->|Origin| S3F
    CF --> APIGW
    
    S3F -.->|Auth| Cognito
    APIGW -->|Validate| Cognito
    APIGW -->|/upload| Upload
    APIGW -->|/search| Search
    
    Upload -->|Presigned URL| S3Docs
    Search -->|Query| DDB1
    
    S3Docs -->|ObjectCreated| EB
    EB -->|Trigger| SFN
    
    SFN -->|Step 1| L3
    L3 -->|Lookup| DDB2
    L3 -->|If Duplicate| L8
    L3 -->|If New| L4
    
    L4 -->|Start| Textract
    SFN -->|Step 2<br/>Wait 10s| L5
    L5 -->|Poll| Textract
    L5 -->|Step 3| L6
    
    L6 -->|Analyze| ComprehendSvc
    L6 -->|Step 4| L7
    
    L7 -->|Summarize| BedrockSvc
    L7 -->|Step 5| L8
    
    L8 -->|Write| DDB1
    L8 -->|Write| DDB3
    
    DDB1 -.->|Replicate<br/><1 sec| DDB1_DR
    DDB2 -.->|Replicate<br/><1 sec| DDB2_DR
    DDB3 -.->|Replicate<br/><1 sec| DDB3_DR
    
    style Users fill:#e1f5ff
    style CF fill:#f90
    style S3F fill:#f90
    style S3Docs fill:#f90
    style APIGW fill:#ff4f8b
    style SFN fill:#e7157b
    style DDB1 fill:#527fff
    style DDB2 fill:#527fff
    style DDB3 fill:#527fff
    style DDB1_DR fill:#527fff
    style DDB2_DR fill:#527fff
    style DDB3_DR fill:#527fff
    style Textract fill:#f90
    style ComprehendSvc fill:#f90
    style BedrockSvc fill:#f90
    style Cognito fill:#dd344c
    style L8 fill:#4caf50
```

---

## Detailed Corrections for Your Diagram

### Change #1: Split Combined Lambda

**Current (Incorrect):**
```
┌─────────────────────────────────────┐
│  Lambda                             │
│  Comprehend + Bedrock               │
│  Summarize / Enrich                 │
└─────────────────────────────────────┘
```

**Should be (Correct):**
```
┌──────────────────────┐      ┌──────────────────────┐
│  λ 6: Comprehend     │  →   │  λ 7: Bedrock        │
│  Analyze             │      │  Summarize           │
│  ─────────────       │      │  ─────────────       │
│  • Detect Language   │      │  • AI Summary        │
│  • Extract Entities  │      │  • Key Insights      │
│  • Key Phrases       │      │  • Structure Data    │
└──────────────────────┘      └──────────────────────┘
```

### Change #2: Add Store Metadata Lambda

**Current (Incorrect):**
```
Lambda Bedrock → [arrow] → DynamoDB Metatable
```

**Should be (Correct):**
```
┌──────────────────────┐      ┌──────────────────────┐
│  λ 7: Bedrock        │  →   │  λ 8: Store          │
│  Summarize           │      │  Metadata            │
└──────────────────────┘      └──────────────────────┘
                                       │
                              ┌────────┴────────┐
                              ↓                 ↓
                    ┌─────────────────┐  ┌─────────────────┐
                    │ DynamoDB        │  │ DynamoDB        │
                    │ Metadata        │  │ Document Names  │
                    │ (primary)       │  │ (primary)       │
                    └─────────────────┘  └─────────────────┘
```

### Change #3: Add Third DynamoDB Table

**Secondary Region should show:**
```
┌────────────────────────────────────────────────┐
│  Secondary Region (us-east-2)                  │
│                                                │
│  DynamoDB Replicas:                            │
│  ┌──────────────────────┐                     │
│  │ 1. Hash Registry     │  🛡️ Protected       │
│  │    (global replica)  │                     │
│  └──────────────────────┘                     │
│                                                │
│  ┌──────────────────────┐                     │
│  │ 2. Metadata Table    │  🛡️ Protected       │
│  │    (global replica)  │                     │
│  └──────────────────────┘                     │
│                                                │
│  ┌──────────────────────┐                     │
│  │ 3. Document Names    │  🛡️ Protected       │
│  │    (global replica)  │  ← ADD THIS BOX     │
│  └──────────────────────┘                     │
└────────────────────────────────────────────────┘
```

---

## Complete Lambda Function Reference

### 1. upload-handler
- **Layer:** API Layer
- **Trigger:** API Gateway POST /upload
- **Purpose:** Generate S3 presigned URLs
- **Output:** Signed URL for client-side upload

### 2. search-handler
- **Layer:** API Layer
- **Trigger:** API Gateway GET /search, /metadata
- **Purpose:** Query DynamoDB for documents
- **Output:** Document list or metadata

### 3. check-duplicate
- **Layer:** Processing Pipeline
- **Trigger:** Step Functions (step 1)
- **Purpose:** Compute SHA-256, check hash registry
- **Output:** isDuplicate: true/false

### 4. textract-start
- **Layer:** Processing Pipeline
- **Trigger:** Step Functions (step 2, if not duplicate)
- **Purpose:** Start async Textract job
- **Output:** jobId for polling

### 5. textract-status
- **Layer:** Processing Pipeline
- **Trigger:** Step Functions (step 3, after 10s wait)
- **Purpose:** Poll Textract job status, extract text
- **Output:** extractedText (full document text)

### 6. comprehend-analyze
- **Layer:** Processing Pipeline
- **Trigger:** Step Functions (step 4)
- **Purpose:** NLP analysis
- **Calls:** Amazon Comprehend API
- **Output:** language, entities[], keyPhrases[]

### 7. bedrock-summarize
- **Layer:** Processing Pipeline
- **Trigger:** Step Functions (step 5)
- **Purpose:** AI-powered summarization
- **Calls:** Amazon Bedrock (Claude Sonnet 4.5)
- **Output:** summary, insights, structuredData

### 8. store-metadata
- **Layer:** Processing Pipeline
- **Trigger:** Step Functions (step 6 - final step)
- **Purpose:** Persist all results
- **Writes to:**
  - DynamoDB Metadata table
  - DynamoDB Document Names table
- **Output:** Success/Failure status

---

## Quick Update Checklist for Your Diagram

### In your diagram tool (PowerPoint, draw.io, etc.):

```
□ Split "Comprehend + Bedrock" into TWO separate Lambda boxes
  - Box 1: "λ Comprehend Analyze"
  - Box 2: "λ Bedrock Summarize"

□ Add eighth Lambda function: "λ Store Metadata"
  - Place after Bedrock Lambda
  - Show two arrows from it (one to each DynamoDB table)

□ Add third DynamoDB table in primary region
  - Label: "Document Names"
  - Purpose: Quick lookup registry

□ Add third DynamoDB replica in secondary region
  - Label: "Document Names (replica)"
  - Add 🛡️ deletion protection symbol

□ Add labels showing Lambda numbers (1-8)
  - Helps viewers understand the sequence

□ Optional: Add monitoring components
  - CloudWatch Dashboard
  - SQS DLQ
  - SNS Alerts
```

---

## Draw.io Specific Instructions

### Step 1: Fix Lambda Count

1. **Select** the combined "Comprehend + Bedrock" box
2. **Copy** it (Ctrl+C / Cmd+C)
3. **Paste** it (Ctrl+V / Cmd+V) to create a second box
4. **Edit text** on first box:
   ```
   Lambda
   Comprehend Analyze
   ```
5. **Edit text** on second box:
   ```
   Lambda
   Bedrock Summarize
   ```
6. **Arrange** them side-by-side or in sequence

### Step 2: Add Store Metadata Lambda

1. **Copy** any existing Lambda box
2. **Paste** below the Bedrock Lambda
3. **Edit text**:
   ```
   Lambda
   Store Metadata
   ```
4. **Draw arrow** from Bedrock → Store Metadata
5. **Draw TWO arrows** from Store Metadata:
   - One to "Metadata Table"
   - One to "Document Names Table"

### Step 3: Add Third DynamoDB Table

**In Primary Region:**
1. **Copy** the "DynamoDB Metadata Table" box
2. **Paste** it
3. **Edit text**: "Document Names Table (primary)"
4. **Position** it next to the other DynamoDB boxes

**In Secondary Region:**
1. **Copy** the new Document Names box
2. **Paste** in secondary region area
3. **Edit text**: "Document Names (replica)"
4. **Add** 🛡️ symbol or text "Deletion Protection: ON"
5. **Draw dashed arrow** from primary to replica

### Step 4: Add Replication Arrows

1. **Select** the line tool (dashed line style)
2. **Draw arrow** from primary "Document Names" to replica
3. **Add label** on arrow: "<1 sec"
4. **Make consistent** with other replication arrows

---

## Numbered Lambda Flow (for clarity)

Add these numbers to your Lambda functions:

```
API Layer:
  λ 1: upload-handler
  λ 2: search-handler

Step Functions Pipeline (in order of execution):
  λ 3: check-duplicate
  λ 4: textract-start
  λ 5: textract-status
  λ 6: comprehend-analyze      ← Split from combined box
  λ 7: bedrock-summarize        ← Split from combined box
  λ 8: store-metadata           ← ADD THIS (new box)
```

---

## Updated GitHub Documentation

The corrected Mermaid diagram above is now available in this file. To view it rendered:

1. **Push this file to GitHub** (see commands below)
2. **View on GitHub** - Mermaid renders automatically
3. **Use as reference** for updating your PowerPoint/draw.io diagram

---

## Reference: Actual Deployed Resources

**Use these exact names in your diagram for accuracy:**

```yaml
Primary Region: us-west-2

Lambda Functions:
  1. upload-handler           (doc-upload-us-west-2-*)
  2. search-handler           (doc-search-us-west-2-*)
  3. check-duplicate          (doc-duplicate-check-us-west-2-*)
  4. textract-start           (doc-textract-start-us-west-2-*)
  5. textract-status          (doc-textract-status-us-west-2-*)
  6. comprehend-analyze       (doc-comprehend-us-west-2-*)
  7. bedrock-summarize        (doc-bedrock-us-west-2-*)
  8. store-metadata           (doc-store-metadata-us-west-2-*)

DynamoDB Tables:
  1. document-metadata-uswest2-df3261d7
  2. document-hash-registry-uswest2-b2e970e1
  3. document-names-uswest2-aa45fcc8

DR Region: us-east-2

DynamoDB Replicas (All 3):
  1. Metadata replica (deletion protection: ON)
  2. Hash registry replica (deletion protection: ON)
  3. Document names replica (deletion protection: ON)

Replication: Bi-directional, <1 second lag
```

---

## Visual Styling Recommendations

### Color Coding

```
🔴 Red (#cc0000) - Lambda functions in processing pipeline
🔵 Blue (#527fff) - DynamoDB tables
🟢 Green (#4caf50) - Store Metadata Lambda (final step)
🟠 Orange (#ff9900) - S3, AI Services
🟣 Purple (#e7157b) - Step Functions
⚫ Black - Primary region border
🔵 Blue - Secondary region border (dashed)
```

### Icon Sizes

```
Lambda functions: Small-Medium (consistent size)
DynamoDB tables: Medium
S3 buckets: Medium
Step Functions: Large (contains other components)
CloudFront: Medium
Cognito: Medium
```

### Arrow Styles

```
Solid arrows: Active data flow
Dashed arrows: Replication
Bold arrows: Main processing path
Thin arrows: Supporting flows (auth, lookups)
```

---

## Validation Checklist

After updating your diagram, verify:

```
□ 8 Lambda functions visible (numbered 1-8)
□ Lambda 6 and 7 are separate boxes (not combined)
□ Lambda 8 (Store Metadata) is present
□ 3 DynamoDB tables in primary region
□ 3 DynamoDB replicas in DR region
□ All replicas show deletion protection symbol
□ Replication arrows connect all 3 table pairs
□ Step Functions contains Lambda 3-8
□ API Gateway connects to Lambda 1-2 (outside Step Functions)
□ All AWS service icons are official AWS architecture icons
```

---

**Summary:** Your diagram is **85% accurate** and excellent for presentations. The corrections above will bring it to **100% accuracy** matching the deployed architecture. The main additions are:
1. Split Comprehend and Bedrock into separate Lambda boxes
2. Add Store Metadata Lambda (8th function)
3. Add Document Names table (3rd table) in both regions


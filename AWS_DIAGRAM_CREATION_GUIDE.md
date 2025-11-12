# AWS Architecture Diagram Creation Guide
## Intelligent Document Processor (SimplifiedDocProcessorStackV3)

**Last Updated:** November 12, 2025  
**Stack:** SimplifiedDocProcessorStackV3  
**Recommended Tool:** diagrams.net (draw.io), Lucidchart, or AWS Architecture Icons

---

## Table of Contents
- [Tool Setup](#tool-setup)
- [AWS Icon Library](#aws-icon-library)
- [Diagram Layout Strategy](#diagram-layout-strategy)
- [Step-by-Step Component Placement](#step-by-step-component-placement)
- [Connection Guidelines](#connection-guidelines)
- [Color Coding & Styling](#color-coding--styling)
- [Final Checklist](#final-checklist)

---

## Tool Setup

### Option 1: diagrams.net (draw.io) - FREE & RECOMMENDED

1. **Access**: https://app.diagrams.net/ (web) or download desktop app
2. **Import AWS Icons**:
   ```
   File → Open Library from → URL
   Paste: https://raw.githubusercontent.com/m-radzikowski/aws-icons-for-plantuml/main/drawio/AWS-Architecture-Icons.xml
   ```
3. **Canvas Settings**:
   - Page Size: A4 Landscape (11" × 8.5") or 1920×1200px
   - Grid: 10pt with snap-to-grid enabled
   - Background: White or #F7F9FA

### Option 2: Download AWS Icons Directly

1. Visit: https://aws.amazon.com/architecture/icons/
2. Download: AWS Architecture Icons (May 2023 or later)
3. Unzip and import into your tool

---

## AWS Icon Library

### Required Services (24 icons)

| Category | Service | Icon File | Size |
|----------|---------|-----------|------|
| **Compute** | AWS Lambda | `Arch_AWS-Lambda_64.png` | 64×64 |
| **Storage** | Amazon S3 | `Arch_Amazon-S3_64.png` | 64×64 |
| **Database** | Amazon DynamoDB | `Arch_Amazon-DynamoDB_64.png` | 64×64 |
| **Application Integration** | AWS Step Functions | `Arch_AWS-Step-Functions_64.png` | 64×64 |
| **Application Integration** | Amazon EventBridge | `Arch_Amazon-EventBridge_64.png` | 64×64 |
| **Application Integration** | Amazon SQS | `Arch_Amazon-Simple-Queue-Service_64.png` | 64×64 |
| **Application Integration** | Amazon SNS | `Arch_Amazon-Simple-Notification-Service_64.png` | 64×64 |
| **Machine Learning** | Amazon Textract | `Arch_Amazon-Textract_64.png` | 64×64 |
| **Machine Learning** | Amazon Comprehend | `Arch_Amazon-Comprehend_64.png` | 64×64 |
| **Machine Learning** | Amazon Bedrock | `Arch_Amazon-Bedrock_64.png` | 64×64 |
| **Networking** | Amazon CloudFront | `Arch_Amazon-CloudFront_64.png` | 64×64 |
| **Networking** | Amazon API Gateway | `Arch_Amazon-API-Gateway_64.png` | 64×64 |
| **Security** | Amazon Cognito | `Arch_Amazon-Cognito_64.png` | 64×64 |
| **Security** | AWS KMS | `Arch_AWS-Key-Management-Service_64.png` | 64×64 |
| **Management** | AWS CloudTrail | `Arch_AWS-CloudTrail_64.png` | 64×64 |
| **Management** | Amazon CloudWatch | `Arch_Amazon-CloudWatch_64.png` | 64×64 |
| **General** | User | `Arch_User_64.png` | 48×48 |
| **General** | AWS Cloud | `Arch_AWS-Cloud_64.png` | 64×64 |

**Resource Icons (smaller)**:
- CloudWatch Alarm: `Res_Amazon-CloudWatch_Alarm_48.png`
- CloudWatch Dashboard: `Res_Amazon-CloudWatch_Dashboard_48.png`

---

## Diagram Layout Strategy

### Canvas Organization (Left to Right Flow)

```
┌───────────────────────────────────────────────────────────────────┐
│                                                                   │
│  [User/Browser] → [CloudFront] → [S3 Frontend]                  │
│        ↓                                                          │
│  [Cognito Auth] → [API Gateway] → [Lambda API]                  │
│                          ↓                                        │
│  [S3 Documents] → [EventBridge] → [Step Functions]              │
│        ↓                                ↓                         │
│  [6 Processing Lambdas] → [AI Services] → [DynamoDB Tables]     │
│                                                                   │
│  [Bottom: Security (KMS, CloudTrail)]                            │
│  [Right Side: Monitoring (CloudWatch, SNS, DLQ)]                 │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Component Placement

### Step 1: Client & Frontend Layer (Top Left)

**Position**: Far left, top

1. **User Icon** (48×48)
   - Label: "👤 User"
   - Position: (100, 100)

2. **Web Browser** (text box or generic device icon)
   - Label: "Web Browser"
   - Position: (100, 200)

3. **CloudFront** (64×64)
   - Label: "CloudFront Distribution\nHTTPS Only\nHTTP/2"
   - Position: (300, 200)

4. **S3 Frontend Bucket** (64×64)
   - Label: "S3 Frontend Bucket\nReact Static Site\nKMS Encrypted"
   - Position: (500, 200)

**Connections:**
- User → Browser: Solid line
- Browser → CloudFront: Solid arrow, label "HTTPS"
- CloudFront → S3 Frontend: Solid arrow, label "OAC"

---

### Step 2: Authentication Layer (Left, Below Frontend)

**Position**: Below CloudFront

1. **Cognito User Pool** (64×64)
   - Label: "Cognito User Pool\nidp-901916-uswe\nAdmin Create Only"
   - Position: (300, 400)

2. **Cognito Authorizer** (smaller, 32×32 or text box)
   - Label: "Cognito Authorizer"
   - Position: (450, 550)

**Connections:**
- Browser ↔ Cognito: Dashed bidirectional, label "Sign In / Token"

---

### Step 3: API Layer (Center Left)

**Position**: Below authentication

1. **API Gateway** (64×64)
   - Label: "API Gateway REST API\nCognito Auth\nThrottle: 100 req/s"
   - Position: (300, 650)

2. **Upload Lambda** (64×64)
   - Label: "λ Upload Handler\n30s timeout\nPresigned URLs"
   - Position: (150, 850)

3. **Search Lambda** (64×64)
   - Label: "λ Search Handler\n30s timeout\nQuery DynamoDB"
   - Position: (450, 850)

**Connections:**
- Browser → API Gateway: Solid arrow, label "API Call + Token"
- API Gateway → Cognito Authorizer: Solid arrow, label "Verify"
- API Gateway → Upload Lambda: Solid arrow, label "/upload"
- API Gateway → Search Lambda: Solid arrow, label "/search, /metadata, /health"

---

### Step 4: Document Storage & Event Processing (Center)

**Position**: Center of canvas

1. **S3 Documents Bucket** (64×64)
   - Label: "S3 Documents Bucket\nKMS Encrypted\nVersioned\nEventBridge Enabled"
   - Position: (700, 500)

2. **EventBridge** (64×64)
   - Label: "EventBridge\nObject Created Event"
   - Position: (900, 500)

3. **Step Functions** (64×64, distinctive color)
   - Label: "Step Functions\nState Machine\n30min timeout"
   - Position: (1100, 500)

**Connections:**
- Upload Lambda → S3 Docs: Dashed arrow, label "Presigned URL"
- Browser → S3 Docs: Dashed arrow, label "PUT file"
- S3 Docs → EventBridge: Solid arrow (bold), label "Object Created"
- EventBridge → Step Functions: Solid arrow (bold), label "Trigger"

---

### Step 5: Processing Lambda Functions (Center, arranged in a row)

**Position**: Below Step Functions

Create a horizontal row of 6 Lambda icons (each 64×64):

1. **Duplicate Check** (200, 750)
   - Label: "λ Duplicate Check\n60s\nSHA-256"

2. **Textract Start** (350, 750)
   - Label: "λ Textract Start\n30s\nAsync Job"

3. **Textract Status** (500, 750)
   - Label: "λ Textract Status\n30s\nPolling"

4. **Comprehend Analyze** (650, 750)
   - Label: "λ Comprehend\n30s\nNLP"

5. **Bedrock Summarize** (800, 750)
   - Label: "λ Bedrock\n45s\nClaude 3"

6. **Store Metadata** (950, 750)
   - Label: "λ Store Metadata\n30s\nDynamoDB"

**Connections from Step Functions:**
- Step Functions → All 6 Lambdas: Solid arrows showing orchestration flow
- Add numbers (1, 2, 3, 4, 5, 6) on connection lines to show sequence

---

### Step 6: AI Services (Below Processing Lambdas)

**Position**: Bottom center

1. **Amazon Textract** (64×64)
   - Label: "Amazon Textract\nText Extraction\nOCR"
   - Position: (425, 950)

2. **Amazon Comprehend** (64×64)
   - Label: "Amazon Comprehend\nNLP Analysis"
   - Position: (650, 950)

3. **Amazon Bedrock** (64×64)
   - Label: "Amazon Bedrock\nClaude Sonnet 3\nSummarization"
   - Position: (800, 950)

**Connections:**
- Textract Start → Textract: Solid arrow, label "StartJob"
- Textract Status → Textract: Solid arrow, label "GetStatus"
- Comprehend Lambda → Comprehend: Solid arrow, label "Detect*"
- Bedrock Lambda → Bedrock: Solid arrow, label "InvokeModel"

---

### Step 7: DynamoDB Tables (Right Side)

**Position**: Right side of canvas

1. **Metadata Table** (64×64)
   - Label: "DynamoDB Global Table\nMetadata\nPK: documentId\nSK: processingDate"
   - Position: (1400, 400)
   - Add small box below: "GSI: LanguageIndex"

2. **Document Names Table** (64×64)
   - Label: "DynamoDB Global Table\nDocument Names\nPK: documentId"
   - Position: (1400, 600)
   - Add small box below: "GSI: S3KeyIndex"

3. **Hash Registry Table** (64×64)
   - Label: "DynamoDB Global Table\nHash Registry\nPK: contentHash"
   - Position: (1400, 800)

4. **DR Replicas** (group of 3 smaller icons, 48×48)
   - Label: "DR Region: us-east-2\nReplicas (Deletion Protected)"
   - Position: (1600, 600)
   - Show 3 small database icons

**Connections:**
- Upload Lambda → Document Names: Solid arrow, label "PutItem"
- Search Lambda → Metadata Table: Solid arrow, label "Query/Scan"
- Search Lambda → Document Names: Solid arrow, label "Query"
- Duplicate Check → Hash Registry: Solid arrow, label "Check/Store"
- Store Metadata → Metadata Table: Solid arrow, label "PutItem"
- All 3 primary tables → DR replicas: Dashed arrows, label "Auto-replicate"

---

### Step 8: Security Layer (Bottom Container)

**Position**: Bottom of canvas, full width

**Create a container** (rectangle with light yellow fill):
- Size: 1800px wide × 120px tall
- Fill: #FFFDE7 (light yellow), 50% opacity
- Label: "Security & Encryption"
- Position: (50, 1100)

**Inside the container (left to right):**

1. **KMS Key** (48×48)
   - Label: "AWS KMS\nCustomer Managed\nAuto-rotation"
   - Position: (200, 1130)

2. **CloudTrail** (48×48)
   - Label: "CloudTrail\nAudit Logging\nFile Validation"
   - Position: (500, 1130)

3. **IAM Roles** (text or small icons)
   - Label: "IAM Execution Roles\nLeast Privilege"
   - Position: (800, 1130)

**Connections (dashed lines from KMS):**
- KMS → S3 Documents: Dashed, label "Encrypts"
- KMS → S3 Frontend: Dashed, label "Encrypts"
- KMS → SQS DLQ: Dashed, label "Encrypts"

---

### Step 9: Monitoring Layer (Right Side Container)

**Position**: Top right corner

**Create a container** (rectangle with light pink fill):
- Size: 350px wide × 500px tall
- Fill: #FCE4EC (light pink), 50% opacity
- Label: "Monitoring & Alerting"
- Position: (1650, 50)

**Inside the container (top to bottom):**

1. **CloudWatch Logs** (48×48)
   - Label: "CloudWatch Logs\n90-day retention"

2. **CloudWatch Dashboard** (48×48)
   - Label: "Dashboard\nDoc Processing Metrics"

3. **CloudWatch Alarm** (48×48)
   - Label: "DLQ Alarm\n≥1 message"

4. **CloudWatch Alarm** (48×48)
   - Label: "Workflow Failure Alarm\n≥1 failure"

5. **SNS Topic** (48×48)
   - Label: "SNS Topic\nAlert Notifications"

6. **SQS DLQ** (48×48)
   - Label: "SQS DLQ\n14-day retention"

**Connections:**
- All Lambdas → CloudWatch Logs: Thin gray arrows
- Step Functions → CloudWatch Logs: Thin gray arrow
- API Gateway → CloudWatch Logs: Thin gray arrow
- CloudWatch Logs → Dashboard: Thin arrow
- DLQ → Alarm: Solid arrow, label "Messages ≥1"
- Step Functions → Alarm: Solid arrow, label "Failures ≥1"
- Both Alarms → SNS: Solid arrows, label "Trigger"
- All Lambdas → DLQ (on error): Red dashed arrows

---

## Connection Guidelines

### Line Types

| Type | Usage | Example |
|------|-------|---------|
| **Solid Bold Arrow** | Primary data flow | S3 → EventBridge → Step Functions |
| **Solid Arrow** | API calls, invocations | API Gateway → Lambda |
| **Dashed Arrow** | Async, configuration, encryption | KMS encrypts S3 |
| **Thin Gray Arrow** | Logging, monitoring | Lambda → CloudWatch |
| **Red Dashed Arrow** | Error flow | Lambda → DLQ |

### Arrow Labels

Use short, clear labels:
- "HTTPS", "Token", "Trigger", "Invoke"
- "PutItem", "Query", "Scan"
- "StartJob", "GetStatus", "InvokeModel"
- "Encrypts", "Replicate", "Auto-sync"

### Connection Routing

- **Minimize crossings**: Route around groups
- **90-degree angles**: Use waypoints for clean turns
- **Group related connections**: Bundle multiple arrows when possible

---

## Color Coding & Styling

### AWS Official Colors

| Service | Hex Color |
|---------|-----------|
| **Lambda** | #FF9900 (Orange) |
| **S3** | #569A31 (Green) |
| **DynamoDB** | #527FFF (Blue) |
| **Step Functions** | #E7157B (Pink/Magenta) |
| **EventBridge** | #FF4F8B (Pink) |
| **API Gateway** | #FF9900 (Orange) |
| **CloudFront** | #8C4FFF (Purple) |
| **Cognito** | #DD344C (Red) |
| **KMS** | #DD344C (Red) |
| **CloudWatch** | #E7157B (Pink) |
| **SNS/SQS** | #FF4F8B (Pink) |
| **Textract/Comprehend/Bedrock** | #FF9900 (Orange) |

### Container Styling

**Security Container:**
- Fill: #FFFDE7 (light yellow)
- Opacity: 50%
- Border: 2pt solid #FFC107 (yellow)
- Corner radius: 10px

**Monitoring Container:**
- Fill: #FCE4EC (light pink)
- Opacity: 50%
- Border: 2pt solid #E91E63 (pink)
- Corner radius: 10px

### Text Styling

**Service Labels:**
- Font: Arial or Helvetica
- Size: 11pt
- Weight: Bold
- Color: #232F3E (AWS dark blue)

**Descriptions:**
- Font: Same as labels
- Size: 9pt
- Weight: Regular
- Color: #687078 (gray)

**Container Titles:**
- Font: Arial or Helvetica
- Size: 14pt
- Weight: Bold
- Color: Match border color

---

## Detailed Layout Coordinates

### Canvas: 2000px × 1250px

**Key Positions:**

```
User:                       (100, 100)
Browser:                    (100, 200)
CloudFront:                 (300, 200)
S3 Frontend:                (500, 200)
Cognito:                    (300, 400)
API Gateway:                (300, 650)
Upload Lambda:              (150, 850)
Search Lambda:              (450, 850)

S3 Documents:               (700, 500)
EventBridge:                (900, 500)
Step Functions:             (1100, 500)

Processing Lambdas (row):
  - Duplicate Check:        (200, 750)
  - Textract Start:         (350, 750)
  - Textract Status:        (500, 750)
  - Comprehend:             (650, 750)
  - Bedrock:                (800, 750)
  - Store Metadata:         (950, 750)

AI Services (row):
  - Textract:               (425, 950)
  - Comprehend:             (650, 950)
  - Bedrock:                (800, 950)

DynamoDB Tables (column):
  - Metadata Table:         (1400, 400)
  - Document Names:         (1400, 600)
  - Hash Registry:          (1400, 800)
  - DR Replicas:            (1600, 600)

Security Container:         (50, 1100) [1800×120px]
  - KMS:                    (200, 1130)
  - CloudTrail:             (500, 1130)
  - IAM Roles:              (800, 1130)

Monitoring Container:       (1650, 50) [350×500px]
  - CloudWatch Logs:        (1700, 100)
  - Dashboard:              (1700, 200)
  - DLQ Alarm:              (1700, 300)
  - Workflow Alarm:         (1700, 400)
  - SNS:                    (1700, 500)
  - DLQ:                    (1700, 600)
```

---

## Final Checklist

### Component Completeness

- [ ] All 8 Lambda functions shown with correct names
- [ ] Step Functions state machine prominently displayed
- [ ] 3 DynamoDB Global Tables with DR replicas
- [ ] All 3 AI services (Textract, Comprehend, Bedrock)
- [ ] Cognito authentication flow visible
- [ ] CloudFront + S3 frontend hosting shown
- [ ] API Gateway with all 4 endpoints labeled
- [ ] KMS encryption relationships shown
- [ ] Monitoring components grouped (CloudWatch, SNS, DLQ)
- [ ] Security layer clearly separated

### Connection Accuracy

- [ ] User → CloudFront → S3 Frontend flow
- [ ] User → Cognito → API Gateway flow
- [ ] S3 → EventBridge → Step Functions flow
- [ ] Step Functions → 6 Processing Lambdas (numbered)
- [ ] Processing Lambdas → AI Services
- [ ] Lambdas → DynamoDB tables
- [ ] DynamoDB → DR replicas (dashed)
- [ ] KMS encryption lines (dashed)
- [ ] Error flow to DLQ (red dashed)
- [ ] Logging flow to CloudWatch (thin gray)

### Styling Quality

- [ ] Official AWS icons used
- [ ] AWS official colors applied
- [ ] Consistent icon sizing (64×64 for primary, 48×48 for secondary)
- [ ] Container backgrounds with proper opacity
- [ ] Text readable at 50% zoom
- [ ] No overlapping elements
- [ ] Clean 90-degree angle connections
- [ ] Proper line weights (bold for primary flow)

### Labels & Annotations

- [ ] All services labeled with full names
- [ ] Timeouts shown on Lambda functions
- [ ] DynamoDB keys shown (PK/SK)
- [ ] GSI indices labeled
- [ ] Connection labels clear and concise
- [ ] Region information visible (us-west-2, us-east-2)
- [ ] Security features annotated (KMS, Encryption, Auth)

### Export Quality

- [ ] Format: PNG, 300 DPI
- [ ] Size: 2000×1250px (16:10 ratio)
- [ ] Background: White or transparent
- [ ] File size: <3 MB
- [ ] Save source file (.drawio, .lucid, etc.)

---

## Alternative: Simplified Version

For executive presentations, create a simplified version:

### Simplified Flow (Horizontal, 5 main components)

```
User → CloudFront/S3 → API Gateway → Step Functions → DynamoDB
           ↓                            ↓              ↓
       Cognito                    8 Lambdas      DR Replica
                                       ↓
                               AI Services
                          (Textract, Comprehend,
                                Bedrock)
```

**Include only:**
- User + Browser
- CloudFront + S3 Frontend
- Cognito (for auth)
- API Gateway
- Step Functions (showing it orchestrates 8 Lambdas)
- 3 AI service icons (grouped)
- 3 DynamoDB tables
- Monitoring box (CloudWatch + Alarms)

**Omit:**
- Individual Lambda details
- S3 Documents bucket
- EventBridge
- KMS details
- CloudTrail
- Specific connection labels

---

## Additional Resources

**AWS Official Resources:**
- Architecture Icons: https://aws.amazon.com/architecture/icons/
- Icon Guidelines: https://d1.awsstatic.com/webteam/architecture-icons/AWS_Architecture_Icon_Guidelines.pdf
- Reference Architectures: https://aws.amazon.com/architecture/

**Diagram Tools:**
- draw.io: https://app.diagrams.net/
- Lucidchart: https://www.lucidchart.com/
- CloudCraft: https://cloudcraft.co/ (3D AWS diagrams)

---

**Document Version:** 1.0  
**Last Updated:** November 12, 2025  
**Stack:** SimplifiedDocProcessorStackV3  
**Estimated Time:** 90-120 minutes for complete diagram

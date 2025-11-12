# AWS Architecture Diagram Creation Guide
## Intelligent Document Processor - Visual Design Instructions

**Last Updated:** November 12, 2025  
**Recommended Tool:** diagrams.net (draw.io), Lucidchart, or AWS Architecture Icons for PowerPoint/Sketch

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

1. **Access the Tool:**
   - Web: https://app.diagrams.net/
   - Desktop: Download from https://github.com/jgraph/drawio-desktop/releases
   - VS Code: Install "Draw.io Integration" extension

2. **Import AWS Icon Library:**
   ```
   File → Open Library from → URL
   Paste: https://raw.githubusercontent.com/m-radzikowski/aws-icons-for-plantuml/main/drawio/AWS-Architecture-Icons.xml
   ```
   
   Or manually:
   - Download AWS Architecture Icons: https://aws.amazon.com/architecture/icons/
   - Unzip the package
   - In draw.io: `File → Open Library → Select the AWS-Architecture-Icons folder`

3. **Canvas Settings:**
   - Page Size: A4 Landscape (11" x 8.5") or Custom (1920 x 1200 px for digital)
   - Grid: 10pt grid with snap-to-grid enabled
   - Background: White or light gray (#F7F9FA)

### Option 2: Lucidchart - PAID (Professional Diagrams)

1. Go to https://www.lucidchart.com/
2. Create account (free trial available)
3. New Document → Import Shape Library → Search "AWS"
4. Enable "AWS Architecture 2023" library

### Option 3: PowerPoint/Keynote - OFFLINE OPTION

1. Download AWS Architecture Icons (PNG/SVG): https://aws.amazon.com/architecture/icons/
2. Unzip to get icon folders organized by service category
3. Insert icons as images, arrange manually

---

## AWS Icon Library

### Icon Categories Needed for This Architecture

Download from: https://aws.amazon.com/architecture/icons/ (Latest: AWS Architecture Icons - May 2023)

**Services You'll Need:**

| Category | Service | Icon File Name |
|----------|---------|----------------|
| **Compute** | AWS Lambda | `Arch_AWS-Lambda_64.png` |
| **Storage** | Amazon S3 | `Arch_Amazon-Simple-Storage-Service_64.png` |
| **Database** | Amazon DynamoDB | `Arch_Amazon-DynamoDB_64.png` |
| **Analytics** | Amazon OpenSearch Service | `Arch_Amazon-OpenSearch-Service_64.png` |
| **Application Integration** | Amazon EventBridge | `Arch_Amazon-EventBridge_64.png` |
| **Machine Learning** | Amazon Bedrock | `Arch_Amazon-Bedrock_64.png` |
| **Networking & Content Delivery** | Amazon VPC | `Arch_Amazon-Virtual-Private-Cloud_64.png` |
| **Networking** | VPC Endpoints | `Res_Amazon-VPC_Endpoints_64.png` |
| **Networking** | NAT Gateway | `Res_Amazon-VPC_NAT-Gateway_64.png` |
| **Networking** | Security Group | `Res_Amazon-VPC_Security-Group_64.png` |
| **Security, Identity & Compliance** | AWS KMS | `Arch_AWS-Key-Management-Service_64.png` |
| **Management & Governance** | AWS CloudTrail | `Arch_AWS-CloudTrail_64.png` |
| **Management & Governance** | Amazon CloudWatch | `Arch_Amazon-CloudWatch_64.png` |
| **Networking & Content Delivery** | Amazon API Gateway | `Arch_Amazon-API-Gateway_64.png` |
| **Application Integration** | Amazon SNS | `Arch_Amazon-Simple-Notification-Service_64.png` |
| **Application Integration** | Amazon SQS | `Arch_Amazon-Simple-Queue-Service_64.png` |
| **General** | User | `Arch_User_64.png` |
| **General** | AWS Cloud | `Arch_AWS-Cloud_64.png` |

**Resource Icons (Smaller Components):**
- `Res_AWS-Lambda_Lambda-Function_64.png`
- `Res_Amazon-API-Gateway_Endpoint_64.png`
- `Res_Amazon-CloudWatch_Alarm_64.png`
- `Res_Amazon-CloudWatch_Dashboard_64.png`

---

## Diagram Layout Strategy

### Canvas Organization (Left to Right Flow)

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│  [Client]  →  [API]  →  [VPC: Lambda + OpenSearch]  →  [Data Stores] │
│                                                                        │
│  [S3 Upload]  →  [EventBridge]  →  [Bedrock Flow]  →  [DynamoDB]    │
│                                                                        │
│  [Security Layer (KMS, CloudTrail, IAM)]                              │
│                                                                        │
│  [Monitoring Layer (CloudWatch, SNS, DLQ)]                            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Grouping Strategy (Use Containers/Swimlanes)

1. **VPC Container** (Large rectangle with rounded corners)
   - Nested: Public Subnets, Private Subnets, Security Groups
   
2. **Security Layer Container** (Bottom section)
   - KMS, CloudTrail, IAM roles
   
3. **Monitoring Layer Container** (Top right or bottom)
   - CloudWatch, SNS, Alarms, DLQ

---

## Step-by-Step Component Placement

### Step 1: Create VPC Container (Foundation)

**Draw.io Instructions:**
1. Drag a **Rectangle** shape (rounded corners)
2. Size: 800px wide × 500px tall
3. Fill: Light blue (#E8F4F8) with 50% opacity
4. Border: Solid 2pt, dark blue (#0066CC)
5. Label: "VPC: DocProcessorVPC (us-west-2)"
6. Position: Center-left of canvas

**Components Inside VPC:**

#### A. Public Subnet (Upper half of VPC)
- Rectangle: 350px × 150px
- Fill: Light green (#E8F5E9)
- Label: "Public Subnet (AZ 1 & 2)"
- Place: Top of VPC container

**Inside Public Subnet:**
- **NAT Gateway** icon
  - Position: Center of public subnet
  - Label below: "NAT Gateway\n(Single instance)"

#### B. Private Subnet (Lower half of VPC)
- Rectangle: 700px × 300px
- Fill: Light orange (#FFF3E0)
- Label: "Private Subnet with Egress (AZ 1 & 2)"
- Place: Bottom 2/3 of VPC container

**Inside Private Subnet:**

1. **Lambda Function (API Handler)**
   - AWS Lambda icon
   - Label: "λ API Handler\n30s timeout\nVPC-attached"
   - Position: Left side

2. **OpenSearch Domain**
   - OpenSearch icon (2 icons side-by-side to show Multi-AZ)
   - Label: "OpenSearch 2.3\nMulti-AZ: 2 nodes\nt3.small.search"
   - Position: Right side

3. **Security Groups** (Overlay as small shields)
   - Lambda SG: Near Lambda icon (green shield)
   - OpenSearch SG: Near OpenSearch icon (orange shield)

#### C. VPC Endpoints (Bottom of VPC, outside subnets)
- Draw small icons or use VPC Endpoint resource icon
- **S3 Gateway Endpoint** (left)
- **DynamoDB Gateway Endpoint** (right)
- Style: Dashed border, light purple fill

---

### Step 2: Place External Client Layer (Far Left)

**Outside VPC, left side:**

1. **User Icon**
   - AWS User icon
   - Label: "👤 User/Application"
   - Position: Far left, vertically centered

2. **AWS CLI/SDK Text**
   - Small text box: "AWS CLI / SDK / Boto3"

---

### Step 3: Place API Gateway (Between Client and VPC)

**Position:** Between User and VPC container

1. **API Gateway Icon**
   - Label: "API Gateway REST API\nIAM Authentication"
   - Style: Orange AWS color (#FF9900)

2. **API Endpoints** (Small boxes below API Gateway)
   - Box 1: "GET /health (Public)"
   - Box 2: "GET/POST /search (IAM)"
   - Box 3: "GET /metadata/:id (IAM)"
   - Layout: 3 small rectangles in a row

**Connection:**
- User → API Gateway: Solid arrow, label "HTTPS"
- API Gateway → Lambda (API Handler): Solid arrow, label "Invoke"

---

### Step 4: Place S3 and Event Processing Flow (Top Center)

**Above VPC or to the right:**

1. **S3 Bucket Icon**
   - Amazon S3 icon
   - Label: "S3 Documents Bucket\nKMS Encrypted\nVersioned\nEventBridge Enabled"
   - Position: Top-center

2. **EventBridge Icon**
   - EventBridge icon
   - Label: "EventBridge\nObject Created Event"
   - Position: Right of S3

3. **Lambda (Flow Invoker)**
   - Lambda icon
   - Label: "λ Flow Invoker\n5min timeout"
   - Position: Right of EventBridge

4. **Bedrock Flow Icon**
   - Bedrock icon (or generic AI icon)
   - Label: "🤖 Bedrock Flow\nClaude Sonnet 3\nDocument Processing"
   - Position: Right of Flow Invoker

**Connections:**
- User → S3: Dashed arrow, label "Upload Document"
- S3 → EventBridge: Solid arrow, label "Object Created"
- EventBridge → Flow Invoker: Solid arrow, label "Trigger"
- Flow Invoker → Bedrock Flow: Solid arrow, label "InvokeFlow API"

---

### Step 5: Place Data Stores (Far Right)

**Right side of canvas:**

1. **DynamoDB Table**
   - DynamoDB icon
   - Label: "DynamoDB\nMetadata Table\nPK: documentId\nSK: processingDate"
   - Add small box below: "GSI: LanguageIndex"

2. **OpenSearch** (Already placed in VPC)
   - Draw connection from API Handler → OpenSearch (inside VPC)

**Connections:**
- Flow Invoker → DynamoDB: Solid arrow, label "PutItem"
- API Handler → DynamoDB: Solid arrow, label "Query/Scan"
- API Handler → OpenSearch: Solid arrow, label "Search"

---

### Step 6: Security Layer (Bottom Section)

**Create a horizontal container at the bottom:**

**Container:**
- Rectangle: Full width, 100px tall
- Fill: Light yellow (#FFFDE7)
- Label: "Security & Encryption"

**Inside Container (Left to Right):**

1. **KMS Icon**
   - Label: "AWS KMS\nCustomer Managed Key\nAuto-rotation"
   
2. **CloudTrail Icon**
   - Label: "CloudTrail\nAudit Logging"
   
3. **IAM Role Icons** (3 small icons)
   - "Flow Execution Role"
   - "Lambda Execution Roles"
   - "API Handler Role"

**Connections (Dashed lines showing encryption):**
- KMS → S3 (dashed, label "Encrypts")
- KMS → DynamoDB (dashed, label "Encrypts")
- KMS → OpenSearch (dashed, label "Encrypts")

---

### Step 7: Monitoring Layer (Right Side or Top Right)

**Create a container:**
- Rectangle: 300px × 400px
- Fill: Light pink (#FCE4EC)
- Label: "Monitoring & Alerting"
- Position: Top-right corner

**Inside Container (Top to Bottom):**

1. **CloudWatch Logs Icon**
   - Label: "CloudWatch Logs"

2. **CloudWatch Dashboard Icon**
   - Label: "Dashboard\nFlow Metrics, API Metrics"

3. **CloudWatch Alarm Icon** (2 icons)
   - "Flow Error Alarm"
   - "DLQ Messages Alarm"

4. **SNS Topic Icon**
   - Label: "SNS Topic\nAlert Notifications"

5. **SQS Queue Icon**
   - Label: "SQS DLQ\n14-day retention"

**Connections:**
- All Lambdas → CloudWatch Logs: Thin arrows
- CloudWatch Alarms → SNS: Solid arrow, label "Trigger"
- Lambdas → DLQ (on error): Dashed red arrow

---

### Step 8: Add Flow Creator Lambda (Infrastructure Component)

**Position:** Near Bedrock Flow, slightly below

1. **Lambda Icon**
   - Label: "λ Flow Creator\nCustom Resource\n5min timeout"
   
2. **CloudFormation Icon** (Optional)
   - Small icon above Flow Creator
   - Label: "CloudFormation Stack"

**Connection:**
- Flow Creator → Bedrock Flow: Dashed arrow, label "Create/Update/Delete"

---

## Connection Guidelines

### Line Types and Meanings

| Line Type | Usage | Example |
|-----------|-------|---------|
| **Solid Arrow** | Data flow, API calls, triggers | User → API Gateway |
| **Dashed Arrow** | Configuration, encryption, optional | KMS encrypts S3 |
| **Dotted Arrow** | Asynchronous, eventual consistency | DynamoDB replication |
| **Bold Arrow** | Primary/critical path | S3 → EventBridge → Lambda |
| **Red Arrow** | Error flow, failures | Lambda → DLQ |

### Arrow Labels (Best Practices)

- **Short and descriptive**: "HTTPS", "Invoke", "Query", "Trigger"
- **Include protocol when relevant**: "HTTPS/TLS 1.2+", "IAM Auth"
- **Show operations**: "PutItem", "GetObject", "InvokeFlow"

### Connection Routing

- **Minimize crossings**: Route around containers when possible
- **Use waypoints**: Add bend points for cleaner 90-degree angles
- **Group related connections**: Bundle multiple connections between same endpoints

---

## Color Coding & Styling

### AWS Service Colors (Official Palette)

| Service Category | Color (Hex) | Usage |
|-----------------|-------------|-------|
| **Compute** (Lambda) | #FF9900 (Orange) | Lambda function icons |
| **Storage** (S3) | #569A31 (Green) | S3 buckets |
| **Database** (DynamoDB) | #527FFF (Blue) | DynamoDB tables |
| **Networking** (VPC) | #3F8624 (Dark Green) | VPC containers |
| **Security** (KMS) | #DD344C (Red) | KMS, IAM, CloudTrail |
| **AI/ML** (Bedrock) | #01A88D (Teal) | Bedrock Flow |
| **Analytics** (OpenSearch) | #8C4FFF (Purple) | OpenSearch domain |
| **Monitoring** (CloudWatch) | #E7157B (Pink) | CloudWatch services |
| **Integration** (EventBridge) | #FF4F8B (Pink) | EventBridge, SNS, SQS |

### Container Styling

**VPC Container:**
- Fill: #E8F4F8 (Light blue), 30% opacity
- Border: 3pt solid #0066CC (AWS blue)
- Corner radius: 10px

**Public Subnet:**
- Fill: #E8F5E9 (Light green), 50% opacity
- Border: 2pt dashed #4CAF50 (Green)

**Private Subnet:**
- Fill: #FFF3E0 (Light orange), 50% opacity
- Border: 2pt dashed #FF9800 (Orange)

**Security Layer:**
- Fill: #FFFDE7 (Light yellow), 50% opacity
- Border: 2pt solid #FFC107 (Yellow)

**Monitoring Layer:**
- Fill: #FCE4EC (Light pink), 50% opacity
- Border: 2pt solid #E91E63 (Pink)

### Text Styling

**Service Labels:**
- Font: Arial or Helvetica
- Size: 10-12pt
- Weight: Bold for service names
- Color: #232F3E (AWS dark blue)

**Descriptions/Metadata:**
- Font: Same as labels
- Size: 8-10pt
- Weight: Regular
- Color: #687078 (Gray)

**Container Titles:**
- Font: Arial or Helvetica
- Size: 14pt
- Weight: Bold
- Color: Match border color

### Icon Sizing

- **Primary Services** (S3, DynamoDB, Lambda, Bedrock): 64px × 64px
- **Secondary Services** (CloudWatch, SNS, KMS): 48px × 48px
- **Resource Icons** (Security Groups, Endpoints): 32px × 32px
- **User/Client Icons**: 48px × 48px

---

## Detailed Layout Coordinates (For Precision)

### Canvas: 1920px × 1200px

**Key Component Positions (X, Y from top-left):**

```
User Icon:                (100, 400)
API Gateway:              (300, 400)
VPC Container:            (550, 200) [800px × 600px]
  - Public Subnet:        (600, 230) [700px × 150px]
  - NAT Gateway:          (950, 290)
  - Private Subnet:       (600, 400) [700px × 380px]
  - Lambda (API Handler): (700, 500)
  - OpenSearch:           (1100, 500)
  - Lambda SG:            (680, 480) [small shield overlay]
  - OpenSearch SG:        (1080, 480) [small shield overlay]
  - VPC Endpoint (S3):    (700, 750)
  - VPC Endpoint (DDB):   (1100, 750)

S3 Bucket:                (550, 50)
EventBridge:              (750, 50)
Flow Invoker Lambda:      (950, 50)
Bedrock Flow:             (1150, 50)
Flow Creator Lambda:      (1150, 150) [below Bedrock]

DynamoDB Table:           (1500, 400)
GSI Label:                (1500, 500) [small box]

Security Container:       (100, 950) [1700px × 150px]
  - KMS:                  (300, 1000)
  - CloudTrail:           (600, 1000)
  - IAM Roles:            (900, 1000)

Monitoring Container:     (1550, 200) [350px × 500px]
  - CloudWatch Logs:      (1600, 250)
  - Dashboard:            (1600, 350)
  - Alarms:               (1600, 450)
  - SNS:                  (1600, 550)
  - DLQ:                  (1600, 650)
```

---

## Layer Organization (Z-Order)

**Back to Front:**
1. **Background containers** (VPC, Security, Monitoring)
2. **Subnet containers** (Public, Private)
3. **Connection lines** (arrows)
4. **Service icons** (S3, Lambda, DynamoDB, etc.)
5. **Labels and text**
6. **Overlay icons** (Security Groups, small badges)

---

## Final Checklist

### Before Exporting

- [ ] All AWS icons are official AWS Architecture Icons (2023 version)
- [ ] VPC container clearly shows public/private subnet separation
- [ ] Security Groups are visible and labeled
- [ ] All Lambda functions show timeout duration
- [ ] KMS encryption relationships are shown (dashed lines)
- [ ] Data flow is left-to-right or top-to-bottom
- [ ] Error flow (DLQ) is highlighted in red
- [ ] Monitoring components are grouped together
- [ ] API Gateway endpoints are labeled with auth type
- [ ] OpenSearch shows Multi-AZ (2 nodes)
- [ ] VPC endpoints are shown and labeled as "Gateway" type
- [ ] NAT Gateway is labeled as "Single instance" (cost optimization note)
- [ ] All connections have direction arrows
- [ ] Critical paths have labels (e.g., "InvokeFlow", "Object Created")
- [ ] Legend is included (optional but recommended)

### Accessibility & Clarity

- [ ] Font size ≥ 10pt for all text
- [ ] Color contrast meets WCAG AA standards (4.5:1 for text)
- [ ] Icons are distinct and recognizable at 50% zoom
- [ ] No overlapping text or icons
- [ ] Connection lines don't obscure icons or text

### Export Settings

**For Digital Use (Documentation, Web):**
- Format: PNG or SVG
- Resolution: 300 DPI or vector
- Size: 1920 × 1200px (16:10 ratio)
- Background: Transparent or white

**For Print:**
- Format: PDF or high-res PNG
- Resolution: 600 DPI
- Size: A4 or Letter
- Color Mode: CMYK (for professional printing)

**For Presentations:**
- Format: PNG with transparent background
- Resolution: 1920 × 1080px (16:9 ratio)
- Optimize file size: < 2 MB

---

## Alternative Layout: Simplified Version

For presentations or executive summaries, create a simplified version:

### Simplified Flow (Horizontal)

```
┌─────┐    ┌─────┐    ┌──────────┐    ┌──────┐    ┌──────┐
│User │ →  │ API │ →  │  Lambda  │ ←  │  S3  │ →  │ DDB  │
│     │    │ GW  │    │ (VPC)    │    │Bucket│    │Table │
└─────┘    └─────┘    └──────────┘    └──────┘    └──────┘
                             ↓
                       ┌──────────┐
                       │OpenSearch│
                       │  (VPC)   │
                       └──────────┘
```

**Components to Include (Minimal):**
1. User
2. API Gateway
3. Lambda (single icon for all 3 functions)
4. S3 Bucket
5. DynamoDB
6. OpenSearch
7. Bedrock Flow
8. VPC container (background)

**Components to Omit:**
- Security Groups (mentioned in notes)
- VPC Endpoints (mentioned in notes)
- CloudWatch detailed components
- IAM roles (mentioned in notes)
- CloudTrail

---

## Example Annotations (Text Boxes)

Add these as callout boxes or numbered annotations:

**1. VPC Isolation:**
> "OpenSearch deployed in VPC with private endpoint only. No public internet access."

**2. Cost Optimization:**
> "Single NAT Gateway reduces costs by 50% (trade-off: not HA across AZs)."

**3. Security:**
> "All data encrypted at rest with customer-managed KMS key. Automatic key rotation enabled."

**4. Monitoring:**
> "CloudWatch Alarms notify via SNS when Flow invocations fail (>5 errors/5min) or DLQ has messages."

**5. API Authentication:**
> "API Gateway uses IAM authentication (AWS Signature V4). No Cognito required."

**6. Event Processing:**
> "S3 uploads trigger EventBridge → Lambda → Bedrock Flow for async document processing."

---

## Additional Resources

### AWS Architecture Icons
- **Official Download:** https://aws.amazon.com/architecture/icons/
- **Icon Guidelines:** https://d1.awsstatic.com/webteam/architecture-icons/AWS_Architecture_Icon_Guidelines.pdf
- **Color Palette:** https://d1.awsstatic.com/webteam/architecture-icons/AWS-Architecture-Assets-For-Light-BG.zip

### AWS Well-Architected Framework
- **Diagrams Guide:** https://aws.amazon.com/architecture/well-architected/

### Diagram Tools
- **draw.io:** https://app.diagrams.net/
- **Lucidchart:** https://www.lucidchart.com/
- **CloudCraft:** https://cloudcraft.co/ (3D AWS diagrams)
- **Miro:** https://miro.com/templates/aws-architecture-diagram/

### Templates
- **AWS Architecture Diagrams:** https://aws.amazon.com/architecture/
- **Reference Architectures:** https://aws.amazon.com/architecture/reference-architecture-diagrams/

---

## Troubleshooting

### Common Issues

**Issue:** Icons look pixelated
- **Solution:** Use SVG format or PNG at 64px minimum. Increase canvas resolution to 300 DPI.

**Issue:** Too many connections crossing each other
- **Solution:** Add waypoints to route connections around containers. Use different connection anchor points (top/bottom/left/right of icons).

**Issue:** Text overlapping icons
- **Solution:** Use text boxes with white/transparent background and slight padding. Position labels below or beside icons, not on top.

**Issue:** VPC container looks cluttered
- **Solution:** Increase VPC container size. Use collapsible groups for subnets. Create a separate detailed VPC diagram.

**Issue:** Colors don't match AWS style
- **Solution:** Use the official AWS color palette (see Color Coding section). Don't use custom colors for AWS service icons.

---

## Version Control

**Recommended File Naming:**
```
intelligent-doc-processor-architecture-v1.0.drawio
intelligent-doc-processor-architecture-v1.0.png
intelligent-doc-processor-architecture-simplified-v1.0.png
```

**Track Changes:**
- Save versioned copies when making major changes
- Keep source file (.drawio, .lucid, etc.) in repository
- Export PNG/SVG for documentation
- Update version number in diagram footer

---

**Document Version:** 1.0  
**Last Updated:** November 12, 2025  
**Created For:** Intelligent Document Processor Project  
**Maintainer:** Architecture Team


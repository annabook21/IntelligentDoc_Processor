# Diagram Quick Reference Checklist
## Intelligent Document Processor - Component List

**Print this page and check off components as you place them**

---

## 🎨 Setup (Do First)

- [ ] Open diagrams.net (https://app.diagrams.net/)
- [ ] Import AWS Architecture Icons library
- [ ] Set canvas to 1920 × 1200px or A4 Landscape
- [ ] Enable grid (10pt) and snap-to-grid
- [ ] Set background to white or #F7F9FA

---

## 📦 Components to Place (35 total)

### Layer 1: VPC Foundation (Place First)

- [ ] **VPC Container** (800×500px, light blue #E8F4F8)
  - Label: "VPC: DocProcessorVPC (us-west-2)"
- [ ] **Public Subnet** (inside VPC, top, green #E8F5E9)
  - [ ] NAT Gateway icon inside
- [ ] **Private Subnet** (inside VPC, bottom, orange #FFF3E0)
  - [ ] Lambda (API Handler) icon
  - [ ] OpenSearch domain icon (2 nodes)
  - [ ] Lambda Security Group (small shield)
  - [ ] OpenSearch Security Group (small shield)
- [ ] **VPC Endpoint - S3** (bottom of VPC)
- [ ] **VPC Endpoint - DynamoDB** (bottom of VPC)

### Layer 2: Client & API (Left Side)

- [ ] **User Icon** (far left)
  - Label: "👤 User/Application"
- [ ] **API Gateway Icon**
  - Label: "API Gateway REST API\nIAM Authentication"
  - [ ] Add 3 endpoint boxes below:
    - GET /health (Public)
    - GET/POST /search (IAM)
    - GET /metadata/:id (IAM)

### Layer 3: Event Processing Flow (Top)

- [ ] **S3 Bucket Icon** (top-center)
  - Label: "S3 Documents Bucket\nKMS Encrypted, Versioned"
- [ ] **EventBridge Icon**
  - Label: "EventBridge\nObject Created Event"
- [ ] **Lambda - Flow Invoker Icon**
  - Label: "λ Flow Invoker\n5min timeout"
- [ ] **Bedrock Flow Icon**
  - Label: "🤖 Bedrock Flow\nClaude Sonnet 3"
- [ ] **Lambda - Flow Creator Icon** (below Bedrock)
  - Label: "λ Flow Creator\nCustom Resource"

### Layer 4: Data Storage (Right Side)

- [ ] **DynamoDB Icon**
  - Label: "DynamoDB\nMetadata Table"
  - [ ] Add GSI box below: "GSI: LanguageIndex"
- [ ] **OpenSearch** (already placed in VPC private subnet)

### Layer 5: Security Layer (Bottom Container)

- [ ] **Security Container** (full width, yellow #FFFDE7)
  - Label: "Security & Encryption"
  - [ ] KMS Icon: "AWS KMS\nCustomer Managed Key"
  - [ ] CloudTrail Icon: "CloudTrail\nAudit Logging"
  - [ ] IAM Role Icons (3):
    - Flow Execution Role
    - Lambda Execution Roles
    - API Handler Role

### Layer 6: Monitoring (Right Container)

- [ ] **Monitoring Container** (top-right, pink #FCE4EC)
  - Label: "Monitoring & Alerting"
  - [ ] CloudWatch Logs Icon
  - [ ] CloudWatch Dashboard Icon
  - [ ] CloudWatch Alarm Icon (Flow Error Alarm)
  - [ ] CloudWatch Alarm Icon (DLQ Messages Alarm)
  - [ ] SNS Topic Icon
  - [ ] SQS DLQ Icon

---

## ➡️ Connections to Draw (26 arrows)

### Primary Data Flow

- [ ] User → API Gateway (solid, "HTTPS")
- [ ] API Gateway → Lambda API Handler (solid, "Invoke")
- [ ] Lambda API Handler → DynamoDB (solid, "Query/Scan")
- [ ] Lambda API Handler → OpenSearch (solid, "Search")
- [ ] User → S3 (dashed, "Upload Document")
- [ ] S3 → EventBridge (solid, "Object Created")
- [ ] EventBridge → Flow Invoker Lambda (solid, "Trigger")
- [ ] Flow Invoker → Bedrock Flow (solid, "InvokeFlow API")
- [ ] Flow Invoker → DynamoDB (solid, "PutItem")
- [ ] Flow Invoker → S3 (dashed, "Read Document")

### Infrastructure & Configuration

- [ ] Flow Creator → Bedrock Flow (dashed, "Create/Update/Delete")
- [ ] Lambda API Handler → VPC Endpoint DDB (dashed)
- [ ] Lambda API Handler → VPC Endpoint S3 (dashed)

### Security & Encryption (Dashed Lines)

- [ ] KMS → S3 (dashed, "Encrypts")
- [ ] KMS → DynamoDB (dashed, "Encrypts")
- [ ] KMS → OpenSearch (dashed, "Encrypts")
- [ ] KMS → SQS DLQ (dashed, "Encrypts")

### Error Handling (Red Dashed)

- [ ] Flow Creator → DLQ (red dashed, "On Error")
- [ ] Flow Invoker → DLQ (red dashed, "On Error")
- [ ] API Handler → DLQ (red dashed, "On Error")

### Monitoring (Thin Gray Lines)

- [ ] Flow Creator → CloudWatch Logs (thin)
- [ ] Flow Invoker → CloudWatch Logs (thin)
- [ ] API Handler → CloudWatch Logs (thin)
- [ ] API Gateway → CloudWatch (thin)
- [ ] DLQ → CloudWatch Alarm (solid, "Messages Visible")
- [ ] CloudWatch Alarms → SNS (solid, "Trigger")

---

## 🎨 Style Checklist

### Colors Applied

- [ ] VPC: Light blue (#E8F4F8)
- [ ] Public Subnet: Light green (#E8F5E9)
- [ ] Private Subnet: Light orange (#FFF3E0)
- [ ] Security Container: Light yellow (#FFFDE7)
- [ ] Monitoring Container: Light pink (#FCE4EC)
- [ ] Lambda icons: Orange (#FF9900)
- [ ] S3 icons: Green (#569A31)
- [ ] DynamoDB icons: Blue (#527FFF)
- [ ] Bedrock icons: Teal (#01A88D)
- [ ] OpenSearch icons: Purple (#8C4FFF)

### Icon Sizes

- [ ] Primary services: 64×64px (S3, DynamoDB, Lambda, Bedrock)
- [ ] Secondary services: 48×48px (CloudWatch, SNS, KMS)
- [ ] Resource icons: 32×32px (Security Groups, Endpoints)

### Text Formatting

- [ ] Service names: Bold, 10-12pt
- [ ] Descriptions: Regular, 8-10pt
- [ ] Container titles: Bold, 14pt
- [ ] All text readable at 50% zoom

---

## 📊 Optional Enhancements

- [ ] Add legend for line types (solid, dashed, dotted)
- [ ] Add region indicator: "us-west-2"
- [ ] Add title: "Intelligent Document Processor - AWS Architecture"
- [ ] Add version number and date in corner
- [ ] Add callout boxes for key features:
  - "VPC-only OpenSearch (no public access)"
  - "KMS encryption at rest"
  - "IAM authentication (no Cognito)"
  - "Single NAT Gateway (cost optimization)"
- [ ] Add availability zone indicators (AZ-1a, AZ-1b)
- [ ] Add costs estimate in corner: "~$264/month"

---

## 📐 Alignment Check

- [ ] All icons aligned to grid
- [ ] Service labels centered below icons
- [ ] Connection lines use 90-degree angles (no diagonal lines)
- [ ] No overlapping text or icons
- [ ] Containers have consistent padding (20px)
- [ ] All arrows point in correct direction
- [ ] Related components are visually grouped

---

## 💾 Export Settings

### For Documentation (README, Wiki)

- [ ] Format: PNG
- [ ] Resolution: 300 DPI
- [ ] Size: 1920 × 1200px
- [ ] Background: White
- [ ] Filename: `intelligent-doc-processor-architecture-v1.0.png`

### For Presentations

- [ ] Format: PNG with transparent background
- [ ] Resolution: 1920 × 1080px
- [ ] Optimize file size: < 2 MB
- [ ] Filename: `intelligent-doc-processor-architecture-presentation.png`

### Source File

- [ ] Save as: `intelligent-doc-processor-architecture-v1.0.drawio`
- [ ] Commit to repository: `/intelligent-doc-processor/images/`

---

## ✅ Final Validation

- [ ] Compare with ARCHITECTURE.md mermaid diagrams
- [ ] Verify all 3 Lambda functions are shown (not 6+)
- [ ] Confirm NO Cognito in diagram
- [ ] Confirm NO Step Functions in diagram
- [ ] Verify Bedrock Flow is central to processing
- [ ] Check that OpenSearch is inside VPC private subnet
- [ ] Ensure NAT Gateway is labeled "Single instance"
- [ ] Verify API Gateway shows IAM authentication
- [ ] Check that all encryption relationships are shown
- [ ] Confirm monitoring layer is complete
- [ ] Review with stakeholders before finalizing

---

## 📞 Quick Reference: AWS Icon Names

Copy these when searching in icon library:

```
AWS Lambda
Amazon S3
Amazon DynamoDB
Amazon OpenSearch Service
Amazon EventBridge
Amazon Bedrock
Amazon VPC
VPC NAT Gateway
VPC Security Group
VPC Endpoints
AWS Key Management Service
AWS CloudTrail
Amazon CloudWatch
Amazon API Gateway
Amazon Simple Notification Service
Amazon Simple Queue Service
User
AWS Cloud
```

---

## 🎯 Priority Order

**If time is limited, create in this order:**

1. **MVP Diagram (30 min):**
   - VPC container with Lambda + OpenSearch
   - S3 → EventBridge → Flow Invoker → Bedrock Flow
   - API Gateway → Lambda API Handler
   - DynamoDB

2. **Add Security (10 min):**
   - KMS with encryption connections
   - Security Groups
   - VPC Endpoints

3. **Add Monitoring (10 min):**
   - CloudWatch + Alarms
   - SNS + DLQ

4. **Polish (10 min):**
   - Color coding
   - Annotations
   - Legend

---

**Total Components:** 35  
**Total Connections:** 26  
**Estimated Time:** 60-90 minutes  
**Difficulty:** Intermediate

---

**Document Version:** 1.0  
**Last Updated:** November 12, 2025  
**Print:** 2 pages (front + back)


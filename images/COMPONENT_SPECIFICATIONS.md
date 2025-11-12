# AWS Component Specifications for Diagram
## Quick Reference Table

**Project:** Intelligent Document Processor  
**Purpose:** Copy-paste specifications while building diagram  

---

## Service Components

| # | Service | AWS Icon Name | Size | Label Text | Color | Position |
|---|---------|---------------|------|------------|-------|----------|
| 1 | Lambda (Flow Creator) | `Arch_AWS-Lambda_64.png` | 64×64 | `λ Flow Creator\nCustom Resource\n5min timeout` | #FF9900 | Near Bedrock Flow |
| 2 | Lambda (Flow Invoker) | `Arch_AWS-Lambda_64.png` | 64×64 | `λ Flow Invoker\n5min timeout\nEventBridge Target` | #FF9900 | Right of EventBridge |
| 3 | Lambda (API Handler) | `Arch_AWS-Lambda_64.png` | 64×64 | `λ API Handler\n30s timeout\nVPC-attached` | #FF9900 | VPC Private Subnet |
| 4 | S3 Bucket | `Arch_Amazon-S3_64.png` | 64×64 | `S3 Documents Bucket\nKMS Encrypted\nVersioned\nEventBridge Enabled` | #569A31 | Top center |
| 5 | DynamoDB Table | `Arch_Amazon-DynamoDB_64.png` | 64×64 | `DynamoDB\nMetadata Table\nPK: documentId\nSK: processingDate` | #527FFF | Right side |
| 6 | OpenSearch Domain | `Arch_Amazon-OpenSearch-Service_64.png` | 64×64 | `OpenSearch 2.3\nMulti-AZ: 2 nodes\nt3.small.search\nVPC-Only` | #8C4FFF | VPC Private Subnet |
| 7 | EventBridge | `Arch_Amazon-EventBridge_64.png` | 64×64 | `EventBridge\nObject Created Event` | #FF4F8B | Right of S3 |
| 8 | Bedrock Flow | `Arch_Amazon-Bedrock_64.png` | 64×64 | `🤖 Bedrock Flow\nClaude Sonnet 3\nDocument Processing` | #01A88D | Right of Flow Invoker |
| 9 | API Gateway | `Arch_Amazon-API-Gateway_64.png` | 64×64 | `API Gateway REST API\nIAM Authentication\nThrottling: 100 req/s` | #FF9900 | Left of VPC |
| 10 | VPC | `Arch_Amazon-VPC_64.png` | Container | `VPC: DocProcessorVPC\n(us-west-2)` | #E8F4F8 | Center |
| 11 | NAT Gateway | `Res_Amazon-VPC_NAT-Gateway_64.png` | 48×48 | `NAT Gateway\n(Single instance)` | #3F8624 | VPC Public Subnet |
| 12 | VPC Endpoint (S3) | `Res_Amazon-VPC_Endpoints_64.png` | 32×32 | `S3 Gateway Endpoint\nFREE` | #8C4FFF | Bottom VPC |
| 13 | VPC Endpoint (DDB) | `Res_Amazon-VPC_Endpoints_64.png` | 32×32 | `DynamoDB Gateway Endpoint\nFREE` | #8C4FFF | Bottom VPC |
| 14 | KMS Key | `Arch_AWS-KMS_64.png` | 48×48 | `AWS KMS\nCustomer Managed Key\nAuto-rotation Enabled` | #DD344C | Security Container |
| 15 | CloudTrail | `Arch_AWS-CloudTrail_64.png` | 48×48 | `CloudTrail\nAudit Logging\nFile Validation` | #DD344C | Security Container |
| 16 | CloudWatch Logs | `Arch_Amazon-CloudWatch_64.png` | 48×48 | `CloudWatch Logs\nCentralized Logging` | #E7157B | Monitoring Container |
| 17 | CloudWatch Dashboard | `Res_Amazon-CloudWatch_Dashboard_64.png` | 48×48 | `CloudWatch Dashboard\nFlow Metrics, API Metrics` | #E7157B | Monitoring Container |
| 18 | CloudWatch Alarm | `Res_Amazon-CloudWatch_Alarm_64.png` | 48×48 | `Flow Error Alarm\n>5 errors/5min` | #E7157B | Monitoring Container |
| 19 | CloudWatch Alarm | `Res_Amazon-CloudWatch_Alarm_64.png` | 48×48 | `DLQ Messages Alarm\n≥1 message` | #E7157B | Monitoring Container |
| 20 | SNS Topic | `Arch_Amazon-SNS_64.png` | 48×48 | `SNS Topic\nAlert Notifications` | #FF4F8B | Monitoring Container |
| 21 | SQS DLQ | `Arch_Amazon-SQS_64.png` | 48×48 | `SQS DLQ\n14-day retention\nKMS Encrypted` | #FF4F8B | Monitoring Container |
| 22 | User | `Arch_User_64.png` | 48×48 | `👤 User/Application` | #232F3E | Far left |
| 23 | Security Group (Lambda) | `Res_Amazon-VPC_Security-Group_64.png` | 32×32 | `Lambda SG\nAllow Outbound All` | #4CAF50 | VPC (overlay) |
| 24 | Security Group (OpenSearch) | `Res_Amazon-VPC_Security-Group_64.png` | 32×32 | `OpenSearch SG\nAllow 443 from Lambda` | #FF9800 | VPC (overlay) |

---

## Container Specifications

| Container Name | Size (px) | Fill Color | Border | Border Color | Corner Radius | Label |
|----------------|-----------|------------|--------|--------------|---------------|-------|
| VPC | 800×600 | #E8F4F8 (30% opacity) | 3pt solid | #0066CC | 10px | `VPC: DocProcessorVPC (us-west-2)` |
| Public Subnet | 700×150 | #E8F5E9 (50% opacity) | 2pt dashed | #4CAF50 | 5px | `Public Subnet (AZ 1 & 2)` |
| Private Subnet | 700×380 | #FFF3E0 (50% opacity) | 2pt dashed | #FF9800 | 5px | `Private Subnet with Egress (AZ 1 & 2)` |
| Security Layer | 1700×150 | #FFFDE7 (50% opacity) | 2pt solid | #FFC107 | 5px | `Security & Encryption` |
| Monitoring Layer | 350×500 | #FCE4EC (50% opacity) | 2pt solid | #E91E63 | 5px | `Monitoring & Alerting` |

---

## Connection Specifications

| From | To | Type | Color | Width | Label | Description |
|------|-----|------|-------|-------|-------|-------------|
| User | API Gateway | Solid arrow | #232F3E | 2pt | `HTTPS` | Client request |
| API Gateway | Lambda API Handler | Solid arrow | #232F3E | 2pt | `Invoke` | API call |
| Lambda API Handler | DynamoDB | Solid arrow | #232F3E | 2pt | `Query/Scan` | Data retrieval |
| Lambda API Handler | OpenSearch | Solid arrow | #232F3E | 2pt | `Search` | Full-text search |
| User | S3 | Dashed arrow | #687078 | 2pt | `Upload Document` | Document upload |
| S3 | EventBridge | Solid arrow | #232F3E | 3pt | `Object Created` | Event trigger |
| EventBridge | Flow Invoker | Solid arrow | #232F3E | 3pt | `Trigger` | Lambda invocation |
| Flow Invoker | Bedrock Flow | Solid arrow | #01A88D | 3pt | `InvokeFlow API` | Flow execution |
| Flow Invoker | DynamoDB | Solid arrow | #232F3E | 2pt | `PutItem` | Store metadata |
| Flow Invoker | S3 | Dashed arrow | #687078 | 1pt | `Read Document` | Optional read |
| Flow Creator | Bedrock Flow | Dashed arrow | #687078 | 2pt | `Create/Update/Delete` | Infrastructure |
| KMS | S3 | Dashed arrow | #DD344C | 1pt | `Encrypts` | Encryption |
| KMS | DynamoDB | Dashed arrow | #DD344C | 1pt | `Encrypts` | Encryption |
| KMS | OpenSearch | Dashed arrow | #DD344C | 1pt | `Encrypts` | Encryption |
| KMS | SQS DLQ | Dashed arrow | #DD344C | 1pt | `Encrypts` | Encryption |
| Flow Creator | DLQ | Dashed arrow | #D32F2F | 2pt | `On Error` | Error handling |
| Flow Invoker | DLQ | Dashed arrow | #D32F2F | 2pt | `On Error` | Error handling |
| API Handler | DLQ | Dashed arrow | #D32F2F | 2pt | `On Error` | Error handling |
| Flow Creator | CloudWatch | Thin solid | #687078 | 1pt | `Logs` | Logging |
| Flow Invoker | CloudWatch | Thin solid | #687078 | 1pt | `Logs` | Logging |
| API Handler | CloudWatch | Thin solid | #687078 | 1pt | `Logs` | Logging |
| API Gateway | CloudWatch | Thin solid | #687078 | 1pt | `Metrics` | Monitoring |
| DLQ | CloudWatch Alarm | Solid arrow | #E7157B | 2pt | `Messages Visible` | Alarm trigger |
| CloudWatch Alarm | SNS | Solid arrow | #E7157B | 2pt | `Trigger` | Notification |
| Lambda SG | OpenSearch SG | Solid arrow | #4CAF50 | 2pt | `HTTPS 443` | Network access |

---

## Text Style Specifications

| Element | Font | Size | Weight | Color | Alignment |
|---------|------|------|--------|-------|-----------|
| Service Name | Arial/Helvetica | 12pt | Bold | #232F3E | Center |
| Service Description | Arial/Helvetica | 9pt | Regular | #687078 | Center |
| Container Title | Arial/Helvetica | 14pt | Bold | Matches border | Left |
| Connection Label | Arial/Helvetica | 9pt | Regular | #232F3E | Center on line |
| Technical Details | Arial/Helvetica | 8pt | Regular | #687078 | Center |

---

## Annotation Callouts (Optional)

| # | Position | Text | Style |
|---|----------|------|-------|
| 1 | Near OpenSearch | `"VPC-only private endpoint. No public internet access."` | Yellow callout box |
| 2 | Near NAT Gateway | `"Single NAT Gateway reduces costs by 50% (not HA)"` | Yellow callout box |
| 3 | Near KMS | `"All data encrypted at rest. Automatic key rotation enabled."` | Yellow callout box |
| 4 | Near API Gateway | `"IAM authentication using AWS Signature V4. No Cognito."` | Green callout box |
| 5 | Near Bedrock Flow | `"Replaces Step Functions. Orchestrates document processing."` | Blue callout box |
| 6 | Near DLQ | `"Failed Lambda invocations sent here after 3 retries."` | Red callout box |

---

## GSI and Sub-components

| Parent | Component | Type | Text | Position |
|--------|-----------|------|------|----------|
| DynamoDB | GSI Label | Small box | `GSI: LanguageIndex\nPK: language\nSK: processingDate` | Below DynamoDB icon |
| API Gateway | Endpoint 1 | Small box | `GET /health (Public)` | Below API GW |
| API Gateway | Endpoint 2 | Small box | `GET/POST /search (IAM)` | Below API GW |
| API Gateway | Endpoint 3 | Small box | `GET /metadata/:id (IAM)` | Below API GW |
| Security Layer | IAM Role 1 | Text | `Flow Execution Role` | In container |
| Security Layer | IAM Role 2 | Text | `Lambda Execution Roles` | In container |
| Security Layer | IAM Role 3 | Text | `API Handler Role` | In container |

---

## Legend (Add to Bottom Right)

| Symbol | Meaning |
|--------|---------|
| **Solid Arrow** → | Data flow / API call |
| **Dashed Arrow** ⤏ | Configuration / Encryption |
| **Red Dashed Arrow** ⤏ | Error flow |
| **Thin Gray Arrow** → | Logging / Monitoring |
| 🔒 **Green Shield** | Lambda Security Group |
| 🔒 **Orange Shield** | OpenSearch Security Group |

---

## Diagram Metadata (Add to Corner)

**Top Left:**
```
Intelligent Document Processor
AWS Architecture Diagram
Version 1.0 | November 2025
```

**Bottom Right:**
```
Region: us-west-2
Estimated Cost: ~$264/month
Components: 35
Connections: 26
```

---

## Color Palette (Hex Codes)

### Container Backgrounds
```
VPC:             #E8F4F8
Public Subnet:   #E8F5E9
Private Subnet:  #FFF3E0
Security:        #FFFDE7
Monitoring:      #FCE4EC
```

### Service Icons (Official AWS)
```
Lambda:          #FF9900
S3:              #569A31
DynamoDB:        #527FFF
OpenSearch:      #8C4FFF
Bedrock:         #01A88D
API Gateway:     #FF9900
EventBridge:     #FF4F8B
KMS:             #DD344C
CloudWatch:      #E7157B
SNS/SQS:         #FF4F8B
VPC:             #3F8624
```

### Connection Lines
```
Primary Flow:    #232F3E (Dark)
Secondary Flow:  #687078 (Gray)
Encryption:      #DD344C (Red)
Error:           #D32F2F (Red)
Monitoring:      #687078 (Gray)
```

---

## Canvas Layout (Coordinate Guide)

**Canvas Size:** 1920 × 1200 px

### Horizontal Zones (X-axis)
- **0-300px**: Client layer (User, CLI)
- **300-550px**: API Gateway
- **550-1350px**: VPC container
- **1350-1700px**: Data stores (DynamoDB)
- **1700-1920px**: Monitoring

### Vertical Zones (Y-axis)
- **0-200px**: Event processing flow (S3, EventBridge, Bedrock)
- **200-800px**: VPC container with services
- **800-950px**: Reserved for connections
- **950-1200px**: Security and monitoring containers

---

## Layering (Z-order)

**Bottom to Top:**
1. Background (white/light gray)
2. Container rectangles (VPC, Security, Monitoring)
3. Subnet containers
4. Connection lines (behind icons)
5. Service icons (main layer)
6. Text labels (above icons)
7. Overlay icons (Security Groups, badges)
8. Callout annotations (top layer)

---

## Export Checklist

### PNG Export (Documentation)
- [ ] Format: PNG
- [ ] Width: 1920px
- [ ] Height: 1200px
- [ ] DPI: 300
- [ ] Background: White (#FFFFFF)
- [ ] Quality: 100%
- [ ] Border: 20px padding
- [ ] Filename: `intelligent-doc-processor-architecture-v1.0.png`

### SVG Export (Scalable)
- [ ] Format: SVG
- [ ] Include fonts: Embed
- [ ] Include images: Embed
- [ ] Optimize: Yes
- [ ] Filename: `intelligent-doc-processor-architecture-v1.0.svg`

### PDF Export (Print)
- [ ] Format: PDF
- [ ] Page size: A4 Landscape
- [ ] Quality: High
- [ ] Embed fonts: Yes
- [ ] Filename: `intelligent-doc-processor-architecture-v1.0.pdf`

---

## Accessibility

- [ ] All text minimum 10pt
- [ ] Color contrast ratio ≥ 4.5:1 (WCAG AA)
- [ ] Icons distinct without color (for colorblind users)
- [ ] Alternative text descriptions in SVG
- [ ] Readable at 50% zoom

---

**Document Version:** 1.0  
**Last Updated:** November 12, 2025  
**Usage:** Reference while building diagram in draw.io/Lucidchart  
**Print:** Recommended for easy reference


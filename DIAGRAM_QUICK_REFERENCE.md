# AWS Architecture Diagram - Quick Reference
## SimplifiedDocProcessorStackV3

**Use this checklist while building your diagram**

---

## Component Checklist (30 items)

### Compute & Storage (10)
- [ ] User icon (👤)
- [ ] Web Browser
- [ ] CloudFront Distribution
- [ ] S3 Frontend Bucket (React app)
- [ ] S3 Documents Bucket (with KMS encryption)
- [ ] Lambda: Upload Handler
- [ ] Lambda: Search Handler
- [ ] Lambda: Duplicate Check
- [ ] Lambda: Textract Start
- [ ] Lambda: Textract Status
- [ ] Lambda: Comprehend Analyze
- [ ] Lambda: Bedrock Summarize
- [ ] Lambda: Store Metadata

### Orchestration & Integration (4)
- [ ] Step Functions State Machine (center, prominent)
- [ ] EventBridge (S3 events)
- [ ] SQS Dead Letter Queue
- [ ] SNS Topic (alerts)

### API & Authentication (3)
- [ ] API Gateway REST API
- [ ] Cognito User Pool
- [ ] Cognito Authorizer

### AI Services (3)
- [ ] Amazon Textract
- [ ] Amazon Comprehend
- [ ] Amazon Bedrock

### Data Layer (4)
- [ ] DynamoDB: Metadata Table (+ LanguageIndex GSI)
- [ ] DynamoDB: Document Names Table (+ S3KeyIndex GSI)
- [ ] DynamoDB: Hash Registry Table
- [ ] DynamoDB DR Replicas (us-east-2)

### Security & Monitoring (6)
- [ ] AWS KMS Key
- [ ] CloudTrail
- [ ] CloudWatch Logs
- [ ] CloudWatch Dashboard
- [ ] CloudWatch Alarm: DLQ Messages
- [ ] CloudWatch Alarm: Workflow Failures

---

## Connection Checklist (28 connections)

### User Flow
- [ ] User → Browser
- [ ] Browser → CloudFront (HTTPS)
- [ ] CloudFront → S3 Frontend (OAC)
- [ ] Browser ↔ Cognito (Sign In / Token)
- [ ] Browser → API Gateway (+ Token)

### API Layer
- [ ] API Gateway → Cognito Authorizer (Verify)
- [ ] API Gateway → Upload Lambda (/upload)
- [ ] API Gateway → Search Lambda (/search, /metadata, /health)

### Document Processing Trigger
- [ ] Upload Lambda → S3 Docs (Presigned URL)
- [ ] Browser → S3 Docs (PUT file)
- [ ] S3 Docs → EventBridge (Object Created)
- [ ] EventBridge → Step Functions (Trigger)

### Step Functions Orchestration
- [ ] Step Functions → Duplicate Check Lambda (1)
- [ ] Step Functions → Textract Start Lambda (2)
- [ ] Step Functions → Textract Status Lambda (3)
- [ ] Step Functions → Comprehend Analyze Lambda (4)
- [ ] Step Functions → Bedrock Summarize Lambda (5)
- [ ] Step Functions → Store Metadata Lambda (6)

### AI Service Calls
- [ ] Textract Start → Textract (StartJob)
- [ ] Textract Status → Textract (GetStatus)
- [ ] Comprehend Lambda → Comprehend (Detect*)
- [ ] Bedrock Lambda → Bedrock (InvokeModel)

### Database Operations
- [ ] Upload Lambda → Document Names Table (PutItem)
- [ ] Search Lambda → Metadata Table (Query)
- [ ] Search Lambda → Document Names Table (Query)
- [ ] Duplicate Check → Hash Registry Table (Check/Store)
- [ ] Store Metadata → Metadata Table (PutItem)

### Replication & Security
- [ ] Metadata Table → DR Replica (Auto-replicate)
- [ ] Document Names → DR Replica (Auto-replicate)
- [ ] Hash Registry → DR Replica (Auto-replicate)
- [ ] KMS → S3 Docs (Encrypts)
- [ ] KMS → S3 Frontend (Encrypts)
- [ ] KMS → SQS DLQ (Encrypts)

### Monitoring & Error Handling
- [ ] All Lambdas → CloudWatch Logs
- [ ] Step Functions → CloudWatch Logs
- [ ] API Gateway → CloudWatch Logs
- [ ] CloudWatch Logs → Dashboard
- [ ] All Lambdas → DLQ (on error, red dashed)
- [ ] DLQ → Alarm (Messages ≥1)
- [ ] Step Functions → Alarm (Failures ≥1)
- [ ] Alarms → SNS (Trigger)

---

## Color Code Reference

| Service | Color | Hex |
|---------|-------|-----|
| Lambda | Orange | #FF9900 |
| S3 | Green | #569A31 |
| DynamoDB | Blue | #527FFF |
| Step Functions | Magenta | #E7157B |
| EventBridge | Pink | #FF4F8B |
| API Gateway | Orange | #FF9900 |
| CloudFront | Purple | #8C4FFF |
| Cognito | Red | #DD344C |
| KMS | Red | #DD344C |
| CloudWatch | Pink | #E7157B |
| AI Services | Orange | #FF9900 |

---

## Line Style Reference

| Style | Usage |
|-------|-------|
| ▬▬▬▶ Bold Solid | Primary data flow (S3→EventBridge→StepFunctions) |
| ──▶ Regular Solid | API calls, invocations |
| - - ▶ Dashed | Async, replication, encryption |
| ····▶ Thin Gray | Logging, monitoring |
| ═══▶ Red Dashed | Error flow to DLQ |

---

## Label Templates

### Lambda Functions
```
λ {Name}
{Timeout}s timeout
{Key Feature}
```

### DynamoDB Tables
```
DynamoDB Global Table
{Table Name}
PK: {Partition Key}
SK: {Sort Key}
```

### Services
```
{Service Name}
{Key Config 1}
{Key Config 2}
```

---

## Container Groups

### Security Container (Bottom)
- **Background:** Light yellow (#FFFDE7)
- **Border:** 2pt yellow (#FFC107)
- **Contains:** KMS, CloudTrail, IAM Roles

### Monitoring Container (Right)
- **Background:** Light pink (#FCE4EC)
- **Border:** 2pt pink (#E91E63)
- **Contains:** CloudWatch (Logs, Dashboard, Alarms), SNS, DLQ

---

## Key Annotations

### Must Include These Labels:
1. "30min timeout" on Step Functions
2. "Cognito Auth" on API Gateway
3. "KMS Encrypted" on S3 buckets
4. "Versioned" on S3 Documents
5. "EventBridge Enabled" on S3 Documents
6. "Admin Create Only" on Cognito
7. "Throttle: 100 req/s" on API Gateway
8. "Auto-rotation" on KMS
9. "90-day retention" on CloudWatch Logs
10. "14-day retention" on SQS DLQ
11. "Deletion Protected" on DR replicas
12. Region labels: "us-west-2" (primary), "us-east-2" (DR)

---

## Export Settings

- **Format:** PNG, 300 DPI
- **Size:** 2000×1250px (16:10 ratio)
- **Background:** White
- **Target file size:** <3 MB
- **Save source file:** Keep .drawio or native format

---

## Time Estimates

| Task | Time |
|------|------|
| Setup & import icons | 10 min |
| Place components | 30 min |
| Draw connections | 25 min |
| Add labels | 15 min |
| Style & polish | 15 min |
| Review & export | 5 min |
| **Total** | **90-100 min** |

---

## Common Mistakes to Avoid

❌ Forgetting to show DR replicas  
❌ Missing the hash registry table  
❌ Showing only 6 Lambdas (there are 8 total)  
❌ Not distinguishing between API Lambdas and Processing Lambdas  
❌ Forgetting Step Functions (it's the orchestrator!)  
❌ Missing Cognito authentication flow  
❌ Not showing KMS encryption relationships  
❌ Forgetting GSI indices on DynamoDB tables  
❌ Missing EventBridge between S3 and Step Functions  
❌ Not showing the Dead Letter Queue  

---

**Print this page and check off items as you build!**

**Document Version:** 1.0  
**Stack:** SimplifiedDocProcessorStackV3  
**Last Updated:** November 12, 2025

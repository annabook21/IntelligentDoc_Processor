# Architecture Diagrams

This directory contains visual architecture diagrams for the Intelligent Document Processor.

## Files

- `multi-region-dr.svg` - Multi-region disaster recovery architecture (create with draw.io)
- `processing-pipeline.svg` - Step Functions workflow diagram (create with draw.io)
- `data-flow.svg` - Data flow and replication diagram (create with draw.io)

## How to Create Diagrams

### Method 1: draw.io (Recommended)

1. **Open draw.io**
   - Go to https://app.diagrams.net/
   - Click **Create New Diagram**

2. **Enable AWS Icons**
   - Click **More Shapes** (bottom left)
   - Search for "AWS"
   - Enable "AWS Architecture 2021" icon set

3. **Create the diagram** using the specs in:
   - `/docs/MULTI_REGION_ARCHITECTURE.md` (detailed ASCII diagrams)
   - `/docs/DR_ARCHITECTURE_DIAGRAM.md` (Mermaid templates)

4. **Export**
   - File → Export as → SVG (recommended) or PNG
   - Save to this directory

### Method 2: Mermaid (Auto-renders on GitHub)

The Mermaid diagrams in the following files will automatically render on GitHub:
- `/README.md` (contains 2 Mermaid diagrams)
- `/docs/DR_ARCHITECTURE_DIAGRAM.md` (contains 3 Mermaid diagrams)

No additional tools needed!

### Method 3: AWS Application Composer

1. Open AWS Console → Application Composer
2. Import CloudFormation template from `backend/cdk.out/SimplifiedDocProcessorStackV3.template.json`
3. Auto-generates visual diagram
4. Export as PNG

### Method 4: CloudCraft (Premium 3D Diagrams)

1. Go to https://www.cloudcraft.co/
2. Connect AWS account
3. Import resources from us-west-2
4. Auto-generates 3D architecture diagram
5. Export as PNG/SVG

## Recommended Diagram Structure

### Multi-Region DR Diagram

**Layers (top to bottom):**
1. **Global Layer**
   - Users (worldwide)
   - CloudFront CDN

2. **Primary Region (us-west-2)**
   - Frontend (S3 + Cognito)
   - API Layer (API Gateway + Lambda)
   - Processing Pipeline (Step Functions + Lambda)
   - AI Services (Textract, Comprehend, Bedrock)
   - Data Storage (DynamoDB Global Tables)

3. **DR Region (us-east-2)**
   - DynamoDB Replicas (with deletion protection)
   - Standby resources

4. **Monitoring**
   - CloudWatch (Dashboard, Alarms, Logs)
   - SQS DLQ
   - SNS Alerts

**Data flow arrows:**
- Solid lines: Active data flow
- Dashed lines: Replication
- Red lines: Error handling
- Green lines: Success path

### Color Scheme

Use these colors for consistency:

```
🔵 Blue (#527fff) - DynamoDB
🟠 Orange (#ff9900) - S3, AWS Services
🟣 Purple (#e7157b) - Step Functions
🔴 Red (#ff6b6b) - Errors, DLQ
🟢 Green (#4caf50) - Success, Active
⚪ Gray (#cccccc) - Standby, Inactive
🟡 Yellow (#ffd700) - Warnings, Pending
```

## Current Deployment Specs

Use these actual values in your diagrams:

```yaml
Primary Region: us-west-2
DR Region: us-east-2

CloudFront Distribution: d3ozz2yllseyw8.cloudfront.net (EG3VA946DD39Z)
API Gateway: l0sgxyjmic.execute-api.us-west-2.amazonaws.com/prod

Cognito User Pool: us-west-2_dFwXN1Q3G
Cognito Domain: idp-901916-uswe.auth.us-west-2.amazoncognito.com

S3 Documents: intelligent-docs-232894901916-uswest2-38c413ba
S3 Frontend: doc-processor-frontend-5b59e817

DynamoDB Metadata: document-metadata-uswest2-df3261d7
DynamoDB Hash Registry: document-hash-registry-uswest2-b2e970e1
DynamoDB Names: document-names-uswest2-aa45fcc8

Step Functions: doc-processing-us-west-2

Lambda Functions: 8
- upload-handler
- search-handler
- check-duplicate
- textract-start
- textract-status
- comprehend-analyze
- bedrock-summarize
- store-metadata
```

## Example Diagram Labels

### For CloudFront
```
Amazon CloudFront
Global CDN Distribution
Domain: d3ozz2yllseyw8.cloudfront.net
✓ SSL/TLS Termination
✓ Edge Caching (216 locations)
✓ DDoS Protection (AWS Shield)
```

### For DynamoDB Global Table
```
DynamoDB Global Table
document-metadata-uswest2-df3261d7

Primary (us-west-2): Active Read/Write
Replica (us-east-2): Active Read/Write

Replication: <1 second
Deletion Protection: ENABLED (DR)
Capacity: On-Demand
Encryption: AWS KMS
```

### For Step Functions
```
AWS Step Functions
State Machine: doc-processing-us-west-2

Workflow Steps:
1. Prepare Input
2. Check Duplicate (λ)
3. Extract Text (λ Textract)
4. Analyze Language (λ Comprehend)
5. Generate Summary (λ Bedrock)
6. Store Metadata (λ)

Timeout: 30 minutes
Logging: CloudWatch (Full)
Error Handling: DLQ
```

---

## Quick Reference: Draw.io Template

To save time, here's a template you can import:

1. Copy the Mermaid diagram from `/docs/DR_ARCHITECTURE_DIAGRAM.md`
2. Paste into https://mermaid.live/
3. Export as SVG
4. Import SVG into draw.io
5. Enhance with AWS icons and colors
6. Save final version here

---

**Pro Tip:** Start with the Mermaid diagrams (they're already done!). They render beautifully on GitHub. Only create draw.io versions if you need high-resolution exports for presentations or documentation.


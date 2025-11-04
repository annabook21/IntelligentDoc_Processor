# AWS Architectural Diagram - Official Style Guide

## AWS Icon Library & Resources

### Official AWS Icons
- **AWS Architecture Icons**: https://aws.amazon.com/architecture/icons/
- **Download**: AWS-Architecture_Icons_AWSServicelight-bg.zip
- **Format**: SVG icons with light backgrounds
- **Usage**: Free for AWS diagrams (check license for commercial use)

### Recommended Tools for AWS-Style Diagrams

1. **Lucidchart** (Recommended)
   - Has built-in AWS icon library
   - Official AWS template available
   - Professional output quality
   - Export to PNG/PDF for presentations

2. **Draw.io (diagrams.net)**
   - Free tool with AWS icon library
   - Good for quick diagrams
   - Can import AWS icons

3. **Visio**
   - Microsoft's professional diagramming tool
   - AWS stencil available
   - Enterprise-standard output

## AWS Diagram Style Guidelines

### Color Scheme
- **AWS Services**: Light blue backgrounds (#F7F7F7 or white)
- **User/External**: Light green (#D5E8D4)
- **Data Flow**: Blue arrows (#1F77B4)
- **Failover/Standby**: Light gray (#E1E1E1)
- **Monitoring**: Light yellow (#FFF2CC)

### Icon Specifications
- **Size**: 64x64 pixels standard
- **Style**: Rounded rectangles with AWS service icons
- **Labels**: Service name below icon
- **Connections**: Clean lines with arrowheads

## Complete AWS-Style Architecture Diagram

### Diagram Title
**"AWS Contextual Chatbot with Amazon Bedrock Knowledge Bases - Architecture Overview"**

### Layout Structure (Recommended)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER                                       │
└─────────────────────┬───────────────────────────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────────────────────────────────┐
│                    CLOUDFRONT                                         │
│              Global CDN Distribution                                   │
│            (Origin Group Failover)                                     │
└─────┬─────────────────────────────┬─────────────────────────────────────┘
      │ Primary Origin              │ Failover Origin
      │ (us-west-2)                 │ (us-east-1)
┌─────▼─────┐                ┌─────▼─────┐
│ S3 BUCKET │                │ S3 BUCKET │
│ Frontend  │                │ Frontend  │
│ Primary   │                │ Failover  │
└───────────┘                └───────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      PRIMARY REGION (us-west-2)                        │
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│  │ API GATEWAY │    │   LAMBDA    │    │   LAMBDA    │                │
│  │             │───▶│   QUERY     │    │   UPLOAD    │                │
│  │ REST API    │    │             │    │             │                │
│  └─────────────┘    └─────────────┘    └─────────────┘                │
│       │                     │                   │                      │
│       │                     ▼                   ▼                      │
│       │              ┌─────────────┐    ┌─────────────┐                │
│       │              │   LAMBDA    │    │   LAMBDA    │                │
│       │              │  INGEST     │    │   STATUS    │                │
│       │              │             │    │             │                │
│       │              └─────────────┘    └─────────────┘                │
│       │                     │                   │                      │
│       │                     ▼                   │                      │
│       │              ┌─────────────┐            │                      │
│       │              │   LAMBDA    │            │                      │
│       │              │   HEALTH    │            │                      │
│       │              │             │            │                      │
│       │              └─────────────┘            │                      │
│       │                     │                   │                      │
│       ▼                     ▼                   ▼                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│  │   BEDROCK   │    │   BEDROCK   │    │   BEDROCK   │                │
│  │ KNOWLEDGE   │    │  GUARDRAILS │    │   CLAUDE    │                │
│  │    BASE     │    │             │    │   SONNET    │                │
│  └─────────────┘    └─────────────┘    └─────────────┘                │
│       │                                                               │
│       ▼                                                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│  │ OPENSEARCH  │    │ S3 BUCKET   │    │ CLOUDWATCH  │                │
│  │ SERVERLESS  │    │ DOCUMENTS   │    │ DASHBOARD   │                │
│  └─────────────┘    └─────────────┘    └─────────────┘                │
│                              │                   │                      │
│                              ▼                   ▼                      │
│                       ┌─────────────┐    ┌─────────────┐                │
│                       │ SNS TOPIC   │    │ DEAD LETTER │                │
│                       │  ALERTS     │    │    QUEUE    │                │
│                       └─────────────┘    └─────────────┘                │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              │ Cross-Region Replication
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    FAILOVER REGION (us-east-1)                         │
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│  │ API GATEWAY │    │   LAMBDA    │    │   LAMBDA    │                │
│  │  (STANDBY)  │    │   QUERY     │    │   UPLOAD    │                │
│  │             │    │ (STANDBY)   │    │ (STANDBY)   │                │
│  └─────────────┘    └─────────────┘    └─────────────┘                │
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│  │   BEDROCK   │    │   BEDROCK   │    │   BEDROCK   │                │
│  │ KNOWLEDGE   │    │  GUARDRAILS │    │   CLAUDE    │                │
│  │    BASE     │    │             │    │   SONNET    │                │
│  │ (STANDBY)   │    │ (STANDBY)   │    │ (STANDBY)   │                │
│  └─────────────┘    └─────────────┘    └─────────────┘                │
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐                                   │
│  │ OPENSEARCH  │    │ S3 BUCKET   │                                   │
│  │ SERVERLESS  │    │ DOCUMENTS   │                                   │
│  │ (STANDBY)   │    │ (REPLICA)   │                                   │
│  └─────────────┘    └─────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

## AWS Icons to Use

### User & External
- **User**: `user-icon.svg`
- **Internet**: `internet-gateway.svg`

### Frontend & CDN
- **CloudFront**: `cloudfront.svg`
- **S3**: `amazon-s3.svg`

### Compute
- **API Gateway**: `api-gateway.svg`
- **Lambda**: `aws-lambda.svg`

### AI/ML Services
- **Bedrock**: `amazon-bedrock.svg`
- **Bedrock Knowledge Base**: `bedrock-knowledge-base.svg`
- **Bedrock Guardrails**: `bedrock-guardrails.svg`

### Storage
- **S3**: `amazon-s3.svg`
- **OpenSearch**: `amazon-opensearch.svg`

### Monitoring
- **CloudWatch**: `amazon-cloudwatch.svg`
- **SNS**: `amazon-sns.svg`
- **SQS**: `amazon-sqs.svg`

## Step-by-Step Creation Instructions

### Using Lucidchart (Recommended)

1. **Create New Diagram**
   - Go to Lucidchart.com
   - Select "AWS Architecture" template
   - Choose blank canvas

2. **Add AWS Icons**
   - Click "Shapes" panel
   - Search for "AWS" to access icon library
   - Drag icons onto canvas

3. **Layout Components**
   - Arrange services according to the layout above
   - Use alignment tools for clean positioning
   - Group related services with rectangles

4. **Add Connections**
   - Use connector tool to draw arrows
   - Label connections where needed
   - Use different line styles for different flows

5. **Apply Styling**
   - Use AWS color scheme
   - Add service labels below icons
   - Apply consistent font (Arial or similar)

6. **Export**
   - Export as PNG (high resolution)
   - Or PDF for presentations

### Using Draw.io

1. **Setup**
   - Go to diagrams.net
   - Create new diagram
   - Add AWS icon library

2. **Import Icons**
   - Download AWS icons from official site
   - Import as custom shapes
   - Or use built-in AWS shapes

3. **Build Diagram**
   - Follow same layout structure
   - Use grid for alignment
   - Group components logically

## Professional Presentation Tips

### For Client Presentations
- **High Resolution**: Export at 300 DPI minimum
- **Clean Layout**: Plenty of white space
- **Consistent Styling**: Same icon sizes and colors
- **Clear Labels**: Service names and purposes
- **Flow Indicators**: Clear data flow arrows

### Color Coding Recommendations
- **Primary Services**: Light blue (#E6F3FF)
- **User/External**: Light green (#E6F7E6)
- **Failover/Standby**: Light gray (#F5F5F5)
- **Monitoring**: Light yellow (#FFFACD)
- **Data Flow**: Blue arrows (#0066CC)

## Alternative: Use AWS Architecture Center

AWS provides official reference architectures:
- **AWS Architecture Center**: https://aws.amazon.com/architecture/
- **Search for**: "RAG", "Bedrock", "Serverless"
- **Use as**: Starting templates for your diagram

## Final Output Specifications

### For README/Documentation
- **Format**: PNG or SVG
- **Size**: 1200x800 pixels minimum
- **Resolution**: 300 DPI for print quality

### For Client Presentations
- **Format**: PNG or PDF
- **Size**: 1920x1080 for full HD
- **Background**: White or light gray
- **Text**: Black, Arial, 12pt minimum

This guide will help you create a professional, AWS-official-style architectural diagram that matches your implementation perfectly!

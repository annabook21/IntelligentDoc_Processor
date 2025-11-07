# Disaster Recovery Architecture

## Overview

The Intelligent Document Processor implements a **multi-region disaster recovery (DR)** strategy to ensure business continuity and data resilience. The system automatically replicates critical data across two AWS regions: **us-west-2** (primary) and **us-east-2** (DR).

## Architecture Components

### Primary Region: us-west-2 (Oregon)

**Active Resources:**
- **CloudFront Distribution** (Global CDN)
  - Serves frontend application globally
  - Origin: S3 bucket in us-west-2
  - SSL/TLS termination
  - Edge caching for low latency

- **API Gateway**
  - RESTful API endpoints
  - Cognito authentication
  - Lambda integration

- **Step Functions State Machine**
  - Document processing orchestration
  - Error handling and retries
  - Status tracking

- **Lambda Functions** (8 functions)
  - Document upload handler
  - Duplicate detection
  - Textract integration
  - Comprehend analysis
  - Bedrock summarization
  - Metadata storage
  - Search handler

- **DynamoDB Global Tables** (Primary Replicas)
  - `document-metadata-uswest2-*`: Document metadata and search index
  - `document-hash-registry-uswest2-*`: Duplicate detection hashes
  - `document-names-uswest2-*`: Document name registry
  - **Replication**: Automatic bi-directional sync to us-east-2

- **S3 Buckets**
  - `intelligent-docs-*`: Document storage with lifecycle policies
  - `doc-processor-frontend-*`: Frontend hosting

- **Cognito User Pool**
  - User authentication
  - OAuth 2.0 hosted UI
  - Domain: `idp-901916-uswe.auth.us-west-2.amazoncognito.com`

### DR Region: us-east-2 (Ohio)

**Passive Resources (Automatic Replication):**
- **DynamoDB Global Table Replicas**
  - `document-metadata`: Read replicas with <1 second lag
  - `document-hash-registry`: Real-time duplicate detection data
  - `document-names`: Document registry
  - **Deletion Protection**: Enabled for all tables in DR region
  - **Cross-Region Replication**: Sub-second latency

**Data Characteristics:**
- **RPO (Recovery Point Objective)**: < 1 second
- **RTO (Recovery Time Objective)**: Manual failover - variable
- **Consistency**: Eventually consistent reads
- **Replication**: Automatic, bi-directional

## Data Replication Strategy

### DynamoDB Global Tables

**Automatic Replication:**
```
us-west-2 (Primary)  ←→  us-east-2 (DR)
     ↓                       ↓
  Active Writes         Read Replicas
  Active Reads          Active Writes (conflict resolution)
```

**Features:**
- **Multi-master**: Both regions can accept writes
- **Conflict Resolution**: Last-writer-wins
- **Replication Lag**: Typically < 1 second
- **Consistency**: Eventually consistent

**Protected Tables:**
```
✓ document-metadata-uswest2-df3261d7
  └── Replica: document-metadata in us-east-2

✓ document-hash-registry-uswest2-b2e970e1
  └── Replica: document-hash-registry in us-east-2

✓ document-names-uswest2-aa45fcc8
  └── Replica: document-names in us-east-2
```

### S3 Data

**Current State:**
- Document storage: Primary region only (us-west-2)
- Frontend assets: Primary region only (us-west-2)

**Recommended Enhancement:**
```bash
# Enable Cross-Region Replication (CRR) for documents
aws s3api put-bucket-replication \
  --bucket intelligent-docs-232894901916-uswest2-38c413ba \
  --replication-configuration file://replication-config.json
```

## Failure Scenarios & Recovery

### Scenario 1: Primary Region (us-west-2) Outage

**Impact:**
- ❌ API Gateway unavailable
- ❌ Lambda functions unavailable
- ❌ Step Functions unavailable
- ❌ CloudFront origin unavailable
- ✅ DynamoDB data intact in us-east-2
- ⚠️  S3 documents unavailable (no CRR configured)

**Recovery Steps:**
1. **Deploy Stack to DR Region (us-east-2)**
   ```bash
   cd intelligent-doc-processor/backend
   export CDK_DEFAULT_REGION=us-east-2
   npx cdk deploy SimplifiedDocProcessorStackV3
   ```

2. **Update DynamoDB Table Names**
   - The new stack will use existing Global Table replicas
   - No data migration needed

3. **Update CloudFront Origin**
   ```bash
   # Point CloudFront to new API Gateway in us-east-2
   aws cloudfront update-distribution \
     --id EG3VA946DD39Z \
     --distribution-config file://updated-config.json
   ```

4. **Update Cognito Callback URLs**
   - Cognito User Pool must be recreated in us-east-2
   - Users will need to re-authenticate

**Estimated RTO:** 15-30 minutes (manual deployment)

### Scenario 2: DynamoDB Table Corruption

**Impact:**
- ❌ Corrupted data in primary region
- ⚠️  Corruption may replicate to DR region

**Recovery Steps:**
1. **Disable Replication** (stop corruption spread)
2. **Point-in-Time Recovery**
   ```bash
   aws dynamodb restore-table-to-point-in-time \
     --source-table-name document-metadata-uswest2-df3261d7 \
     --target-table-name document-metadata-restored \
     --restore-date-time 2024-11-07T12:00:00Z
   ```

3. **Verify Data Integrity**
4. **Re-enable Replication**

**Estimated RTO:** 1-2 hours

### Scenario 3: Accidental Data Deletion

**Impact:**
- ❌ Document metadata deleted
- ⚠️  Deletion replicates to DR region

**Recovery Steps:**
1. **Use DynamoDB Point-in-Time Recovery** (up to 35 days)
2. **Restore from automated backups**
3. **Merge restored data with current state**

**Estimated RTO:** 2-4 hours

## Monitoring & Alerting

### CloudWatch Metrics

**Primary Region Monitoring:**
```
✓ Step Functions Execution Failures
✓ Lambda Function Errors
✓ API Gateway 5xx Errors
✓ DLQ Message Count (Alert Threshold: 5 messages)
✓ DynamoDB Replication Lag (Alert Threshold: > 5 seconds)
```

**DR Region Monitoring:**
```
✓ DynamoDB Replication Health
✓ Table Read/Write Capacity
✓ Replication Latency
```

### Alarms Configured

| Alarm | Threshold | Action |
|-------|-----------|--------|
| Workflow Failure | > 3 in 5 min | SNS notification |
| DLQ Messages | ≥ 5 messages | SNS notification |
| API Gateway 5xx | > 10 in 5 min | SNS notification |
| Lambda Errors | > 5 in 5 min | SNS notification |

**Alert Email:** Configured via SNS topic

## Cost Considerations

### Monthly Cost Breakdown (Estimated)

**Primary Region (us-west-2):**
- Lambda Executions: ~$50-100/month (1M documents)
- Step Functions: ~$25-50/month
- DynamoDB: ~$100-200/month (10GB, 25 WCU/RCU)
- S3 Storage: ~$23/GB/month (lifecycle to Glacier after 90 days)
- API Gateway: ~$3.50 per million requests
- Textract: ~$1.50 per 1,000 pages
- Comprehend: ~$0.0001 per character
- Bedrock (Claude Sonnet 4.5): ~$3.00 per 1M input tokens

**DR Region (us-east-2):**
- DynamoDB Global Tables (Replicas): ~$100-200/month
  - rWCU (replicated write capacity): Same cost as WCU
  - Read capacity: Additional cost
- Cross-Region Data Transfer: ~$0.02/GB

**Total DR Overhead:** ~30-40% additional cost for data replication

## Security & Compliance

### Data Protection

**Encryption at Rest:**
- ✅ DynamoDB: AWS managed KMS keys
- ✅ S3: KMS encryption enabled
- ✅ CloudWatch Logs: Encrypted

**Encryption in Transit:**
- ✅ HTTPS/TLS 1.2+ required
- ✅ CloudFront SSL/TLS termination
- ✅ API Gateway with custom domain (recommended)

**Access Control:**
- ✅ IAM roles with least privilege
- ✅ Cognito user authentication
- ✅ S3 bucket policies (block public access)
- ✅ DynamoDB deletion protection (DR region)

### Compliance Considerations

**Data Residency:**
- Primary data processing: us-west-2
- Backup data: us-east-2
- CloudFront: Global edge locations

**Audit Trail:**
- CloudWatch Logs: 7-day retention
- S3 Access Logs: Available (not configured)
- CloudTrail: AWS account-level (recommended to enable)

## Testing & Validation

### DR Testing Schedule

**Quarterly DR Drills:**
1. **Failover Test**
   - Deploy to DR region
   - Validate functionality
   - Measure RTO/RPO
   - Document findings

2. **Data Integrity Test**
   - Compare primary and DR data
   - Validate replication lag
   - Test point-in-time recovery

3. **Runbook Validation**
   - Execute recovery procedures
   - Update documentation
   - Train team members

### Testing Checklist

```
□ Deploy stack to us-east-2
□ Verify DynamoDB Global Table connectivity
□ Test document upload and processing
□ Validate search functionality
□ Check authentication flow
□ Measure replication lag
□ Test point-in-time recovery
□ Validate monitoring and alerts
□ Document lessons learned
```

## Recommendations for Enhanced DR

### 1. S3 Cross-Region Replication
```typescript
// Add to CDK stack
docsBucket.addLifecycleRule({
  enabled: true,
  transitions: [
    { storageClass: s3.StorageClass.GLACIER, transitionAfter: Duration.days(90) }
  ]
});

// Enable CRR to us-east-2
const drBucket = new s3.Bucket(this, 'DrDocumentsBucket', {
  bucketName: `intelligent-docs-dr-${this.account}-useast2`,
  versioned: true,
  removalPolicy: RemovalPolicy.RETAIN,
});

docsBucket.addToResourcePolicy(new iam.PolicyStatement({
  actions: ['s3:ReplicateObject'],
  resources: [drBucket.arnForObjects('*')],
  principals: [new iam.ServicePrincipal('s3.amazonaws.com')],
}));
```

### 2. Multi-Region CloudFront with Origin Failover
```typescript
const distribution = new cloudfront.Distribution(this, 'MultiRegionDist', {
  defaultBehavior: {
    origin: new origins.S3Origin(primaryBucket),
    originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
  },
  // Add origin group with automatic failover
});
```

### 3. Route 53 Health Checks & Failover
```typescript
// Create health check for primary API
const healthCheck = new route53.CfnHealthCheck(this, 'ApiHealthCheck', {
  healthCheckConfig: {
    type: 'HTTPS',
    resourcePath: '/health',
    fullyQualifiedDomainName: api.restApiId + '.execute-api.us-west-2.amazonaws.com',
  },
});

// Failover routing policy
new route53.RecordSet(this, 'ApiFailoverRecord', {
  zone: hostedZone,
  recordName: 'api.yourdomain.com',
  recordType: route53.RecordType.A,
  target: route53.RecordTarget.fromAlias(new targets.ApiGateway(api)),
  failover: route53.Failover.PRIMARY,
  healthCheck: healthCheck,
});
```

### 4. Automated Failover with Lambda
```typescript
// Lambda function to monitor and trigger failover
const failoverLambda = new lambda.Function(this, 'FailoverOrchestrator', {
  runtime: lambda.Runtime.PYTHON_3_11,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/failover'),
  timeout: Duration.minutes(15),
  environment: {
    PRIMARY_REGION: 'us-west-2',
    DR_REGION: 'us-east-2',
    HEALTH_CHECK_URL: api.url,
  },
});

// EventBridge rule to trigger every 5 minutes
new events.Rule(this, 'FailoverMonitor', {
  schedule: events.Schedule.rate(Duration.minutes(5)),
  targets: [new targets.LambdaFunction(failoverLambda)],
});
```

## Summary

**Current DR Capabilities:**
- ✅ DynamoDB Global Tables with <1s replication
- ✅ Deletion protection enabled
- ✅ Automated data synchronization
- ⚠️  Manual failover required (15-30 min RTO)
- ❌ S3 documents not replicated

**Recommended Next Steps:**
1. Enable S3 Cross-Region Replication (Priority: High)
2. Implement automated health checks (Priority: High)
3. Create failover runbook and train team (Priority: High)
4. Quarterly DR testing (Priority: Medium)
5. Automate failover with Route 53 (Priority: Medium)
6. Document retention policies (Priority: Low)

---

**Last Updated:** November 7, 2025  
**Document Owner:** Infrastructure Team  
**Review Cycle:** Quarterly


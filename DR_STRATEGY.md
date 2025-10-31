# Disaster Recovery Strategy

## Current DR Implementation (Single Region)

### ✅ What We Have Now

1. **S3 Versioning** ✅
   - Enabled: `versioned: true`
   - Provides point-in-time recovery for documents
   - Can restore any previous version of a document
   - Protection against accidental deletion or corruption

2. **DynamoDB Point-in-Time Recovery (PITR)** ✅
   - Enabled: `pointInTimeRecovery: true`
   - Can restore table to any point in time within last 35 days
   - Protection against data corruption or accidental deletion

3. **Retention Policies** ✅
   - S3: `RemovalPolicy.RETAIN` - Prevents accidental deletion
   - DynamoDB: `RemovalPolicy.RETAIN` - Prevents accidental deletion
   - KMS Key: `RemovalPolicy.RETAIN` - Encryption keys retained

### ❌ What We're Missing (Multi-Region DR)

1. **No Multi-Region Deployment**
   - Single region only (currently configured for one region)
   - If region fails, entire system is unavailable

2. **No Cross-Region Replication**
   - S3: No Cross-Region Replication (CRR) configured
   - DynamoDB: No Global Tables configured
   - No backup region for failover

3. **No Failover Procedures**
   - No Route53 health checks for automatic failover
   - No documented failover runbook
   - No DR testing procedures

## DR Strategy Options

### Option 1: Backup and Restore (Current - Basic)
**RTO**: Hours to days  
**RPO**: Up to 35 days (DynamoDB PITR limit)

**What It Provides:**
- Point-in-time recovery within same region
- Protection against accidental deletion
- Manual restoration process

**Limitations:**
- No automatic failover
- Significant downtime during recovery
- Data loss up to time of last PITR snapshot

---

### Option 2: Pilot Light (Recommended for Production)
**RTO**: Minutes to hours  
**RPO**: Minutes (with replication lag)

**Implementation:**
1. **S3 Cross-Region Replication (CRR)**
   - Replicate documents to secondary region
   - Automatic, asynchronous replication
   - Can replicate to same or different storage classes

2. **DynamoDB Global Tables**
   - Multi-region active-active replication
   - Automatic failover
   - Eventual consistency between regions

3. **CDK Stack in Secondary Region**
   - Deploy infrastructure to DR region
   - Lambda functions, API Gateway, EventBridge rules
   - Keep in "pilot light" mode (running but minimal traffic)

**Cost**: ~2x infrastructure costs (primary + DR region)

---

### Option 3: Warm Standby (Higher Availability)
**RTO**: Minutes  
**RPO**: Seconds to minutes

**Implementation:**
- Same as Pilot Light, but:
  - Secondary region actively processing (but at reduced capacity)
  - Route53 health checks with automatic failover
  - Pre-warmed Lambda functions
  - Active DynamoDB Global Tables

**Cost**: ~2x infrastructure costs + active processing in DR region

---

### Option 4: Multi-Site Active/Active (Enterprise)
**RTO**: Near zero  
**RPO**: Seconds

**Implementation:**
- Both regions actively processing
- Load balanced across regions
- Real-time synchronization

**Cost**: ~2x infrastructure costs + active processing in both regions

## Recommended DR Strategy

### For This Project: **Pilot Light** (Option 2)

**Why:**
- Balances cost vs. availability
- Provides automatic failover capability
- Reasonable RTO/RPO for document processing workload
- Matches AWS best practices for most workloads

**Implementation Plan:**

#### 1. S3 Cross-Region Replication
```typescript
// Add to simplified-doc-processor-stack.ts
const drBucket = new s3.Bucket(this, "DRBucket", {
  bucketName: `intelligent-docs-dr-${uuid.v4()}`,
  region: "us-east-2", // Secondary region
  // ... encryption, versioning, etc.
});

docsBucket.addReplicationConfiguration({
  role: replicationRole,
  rules: [{
    id: "DRReplication",
    status: s3.ReplicationRuleStatus.ENABLED,
    destination: {
      bucket: drBucket,
      storageClass: s3.StorageClass.STANDARD,
    },
  }],
});
```

#### 2. DynamoDB Global Tables
```typescript
// Replace Table with GlobalTable
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

const metadataTable = new dynamodb.Table(this, "MetadataTable", {
  // ... existing config
});

// Add replica region
new dynamodb.CfnGlobalTable(this, "MetadataGlobalTable", {
  tableName: metadataTable.tableName,
  replicas: [
    { region: this.region },
    { region: "us-east-2" }, // DR region
  ],
});
```

#### 3. Multi-Region CDK Stack
```typescript
// Deploy same stack to secondary region
// Keep minimal traffic (pilot light mode)
```

#### 4. Route53 Health Checks (Optional)
- Health check on primary region API Gateway
- Automatic DNS failover to secondary region
- RTO: ~2-3 minutes

## Current Status Summary

| DR Component | Status | Implementation |
|--------------|--------|----------------|
| **S3 Versioning** | ✅ Implemented | Point-in-time recovery |
| **DynamoDB PITR** | ✅ Implemented | 35-day recovery window |
| **S3 Cross-Region Replication** | ❌ Not Implemented | Would need CRR configuration |
| **DynamoDB Global Tables** | ❌ Not Implemented | Would need multi-region setup |
| **Multi-Region Deployment** | ❌ Not Implemented | Single region only |
| **Automatic Failover** | ❌ Not Implemented | No Route53 health checks |
| **DR Testing** | ❌ Not Implemented | No documented procedures |

## Next Steps

1. **Decide on DR Requirements:**
   - What RTO (Recovery Time Objective) do you need?
   - What RPO (Recovery Point Objective) can you accept?
   - What's your budget for DR infrastructure?

2. **If Pilot Light is acceptable:**
   - Implement S3 Cross-Region Replication
   - Implement DynamoDB Global Tables
   - Deploy CDK stack to secondary region
   - Document failover procedures

3. **If current (Backup and Restore) is sufficient:**
   - Document current DR capabilities
   - Create runbook for point-in-time recovery
   - Set up regular backup testing

## Cost Considerations

- **Current (Single Region)**: ~$50-100/month
- **Pilot Light (Multi-Region)**: ~$100-200/month (2x cost)
- **Warm Standby**: ~$150-300/month (2x + active processing)
- **Active/Active**: ~$200-400/month (full duplication)


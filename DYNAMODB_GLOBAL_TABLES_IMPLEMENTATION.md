# DynamoDB Global Tables Implementation

## Implementation Summary

Following AWS Best Practices from:
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_reqs_bestpractices.html
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GlobalTables.html

## What Was Implemented

### ✅ DynamoDB Global Tables (v2 - 2019.11.21)

**Configuration:**
- **Primary Region**: Current deployment region (e.g., us-west-2)
- **DR Region**: us-east-2 (configurable via `DR_REGION` environment variable)
- **Active-Active Replication**: Both regions can handle reads and writes
- **Automatic Replication**: Data automatically replicated across regions
- **Point-in-Time Recovery**: Enabled on both replicas (35-day recovery window)
- **Deletion Protection**: Enabled on both replicas (prevents accidental deletion)
- **KMS Encryption**: Customer-managed KMS encryption at rest

**Table Structure:**
- Partition Key: `documentId` (String)
- Sort Key: `processingDate` (String)
- GSI: `LanguageIndex` (language + processingDate)

**Features:**
- Eventual consistency across regions (last writer wins conflict resolution)
- Multi-master writes (can write to either region)
- Automatic failover capability

## Architecture

```
Primary Region (us-west-2)          DR Region (us-east-2)
┌─────────────────────────┐        ┌─────────────────────────┐
│ DynamoDB Global Table    │◄───────►│ DynamoDB Global Table   │
│ Replica (Primary)       │ Repl.   │ Replica (DR)            │
│                         │         │                         │
│ - documentId (PK)       │         │ - documentId (PK)       │
│ - processingDate (SK)   │         │ - processingDate (SK)   │
│ - LanguageIndex (GSI)   │         │ - LanguageIndex (GSI)   │
│                         │         │                         │
│ KMS: Primary Key        │         │ KMS: Primary Key        │
│ PITR: Enabled           │         │ PITR: Enabled           │
│ Deletion Protection: ✅ │         │ Deletion Protection: ✅ │
└─────────────────────────┘         └─────────────────────────┘
```

## KMS Encryption Considerations

**Important**: KMS keys are region-specific. Each Global Table replica needs its own KMS key in its region.

### Current Implementation
- Uses primary region's KMS key for both replicas
- This will work for primary region
- DR region will need its own KMS key or key replica

### Options for KMS in DR Region

**Option 1: Use AWS-Managed Encryption (Simplest)**
```typescript
sseSpecification: {
  sseEnabled: true,
  sseType: "AES256", // AWS-managed, no key needed
}
```

**Option 2: Create KMS Key Replica (Recommended for production)**
- Create KMS key replica in DR region using AWS KMS multi-region keys
- Reference the replica key ID in DR region replica configuration

**Option 3: Create Separate KMS Key in DR Region**
- Deploy separate CDK stack to DR region with its own KMS key
- Use that key ID in Global Table replica configuration

## How It Works

### Write Path
1. Lambda writes to local region's DynamoDB replica
2. DynamoDB automatically replicates to DR region (typically < 1 second)
3. Both regions have the same data

### Read Path
1. Lambda reads from local region's DynamoDB replica (low latency)
2. Data is eventually consistent (may see slightly stale data if read immediately after write)

### Failover Scenario
1. Primary region becomes unavailable
2. Application code continues writing to DR region (no code changes needed)
3. When primary region recovers, DynamoDB automatically syncs

## Deployment Notes

### Single Stack Deployment
The Global Table is defined in a single CDK stack. When deployed:
- Creates table in primary region
- Automatically creates replica in DR region
- Both replicas are managed together

### Lambda Configuration
- Lambda functions reference table by name
- DynamoDB SDK automatically connects to local region replica
- No code changes needed for multi-region support

### IAM Permissions
- Lambda has permissions to both regions (for direct access if needed)
- By default, Lambda uses local region replica (better performance)

## Testing DR Setup

### 1. Verify Replication
```bash
# Write to primary region
aws dynamodb put-item \
  --region us-west-2 \
  --table-name document-metadata-us-west-2 \
  --item '{"documentId":{"S":"test123"},"processingDate":{"S":"2024-01-01"}}'

# Read from DR region (should have the data within seconds)
aws dynamodb get-item \
  --region us-east-2 \
  --table-name document-metadata-us-west-2 \
  --key '{"documentId":{"S":"test123"},"processingDate":{"S":"2024-01-01"}}'
```

### 2. Test Failover
- Stop writing to primary region
- Write to DR region directly
- Verify data is accessible
- Resume primary region (automatic sync)

## Benefits

✅ **Automatic Replication**: No manual backup/restore needed  
✅ **Active-Active**: Both regions can serve traffic  
✅ **Low Latency**: Reads from local region  
✅ **High Availability**: 99.999% SLA (per AWS)  
✅ **Point-in-Time Recovery**: 35-day recovery window on both replicas  
✅ **Deletion Protection**: Prevents accidental deletion  

## Limitations

⚠️ **Eventual Consistency**: Not strongly consistent across regions  
⚠️ **Conflict Resolution**: Last writer wins (design application accordingly)  
⚠️ **Replication Lag**: Typically < 1 second, but can be higher  
⚠️ **Cost**: ~2x DynamoDB costs (primary + DR region)  
⚠️ **KMS Keys**: Each region needs its own KMS key (currently using primary key)  

## Cost Impact

- **Single Region**: ~$1.25 per million requests (DynamoDB on-demand)
- **Global Tables**: ~$2.50 per million requests (2x replication)
- Plus: Data transfer costs for replication (~$0.02/GB)

For 1 million requests/month: Additional ~$1.25/month for DR

## Next Steps

1. **Fix KMS Encryption**: Create KMS key replica or use AWS-managed encryption for DR region
2. **Deploy to Secondary Region**: Deploy full stack to DR region for complete failover
3. **Configure S3 Cross-Region Replication**: Replicate documents to DR region
4. **Test Failover**: Document and test failover procedures
5. **Monitor Replication Lag**: Set up CloudWatch alarms for replication lag

## References

- [DynamoDB Global Tables Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/V2globaltables_reqs_bestpractices.html)
- [DynamoDB Global Tables Developer Guide](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GlobalTables.html)
- [CDK CfnGlobalTable Documentation](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_dynamodb.CfnGlobalTable.html)


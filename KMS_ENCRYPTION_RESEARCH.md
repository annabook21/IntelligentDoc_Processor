# KMS Encryption Research for DynamoDB Global Tables

## AWS Documentation Findings

### Key Requirements (from AWS Docs)

1. **Each replica must use a KMS key in its own region**
   - KMS keys are region-specific
   - Cannot use a key from one region in another region

2. **All replicas must use the same TYPE of key**
   - AWS-owned keys
   - AWS-managed keys (`alias/aws/dynamodb`)
   - Customer-managed keys

3. **For customer-managed keys**
   - Each region needs its own customer-managed key instance
   - Cannot reuse the same key across regions

## Recommended Solution: AWS-Managed Encryption

**AWS Documentation Reference:**
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/globaltables-security.html

**Solution**: Use AWS-managed encryption (`alias/aws/dynamodb`) for Global Tables

**Why:**
1. ✅ Available automatically in all AWS regions
2. ✅ No key management overhead
3. ✅ Still encrypted (just managed by AWS)
4. ✅ All replicas use the same type (AWS-managed)
5. ✅ Meets AWS best practices for Global Tables

**Alternative (if customer-managed keys are required):**
- Create separate customer-managed keys in each region
- Requires deploying stack to DR region or using multi-region keys
- More complex but provides full control

## Implementation Decision

**Use AWS-managed encryption for DynamoDB Global Tables** to:
- Simplify deployment
- Avoid cross-region key dependencies
- Follow AWS best practices
- Ensure automatic availability in all regions

**Note**: Other resources (S3, Lambda environment variables) can still use customer-managed keys in their respective regions.


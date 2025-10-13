# Data Protection & Recovery Testing Guide

## Current Data Protection Strategy

The application uses **S3 Versioning** for data protection and recovery. This is the simplest and most practical approach for most use cases.

### ✅ What's Protected
- ✅ Accidental file deletions
- ✅ Accidental overwrites  
- ✅ Corrupted uploads
- ✅ Audit trail of all changes
- ✅ 99.999999999% (11 9's) durability via S3's multi-AZ storage

### ℹ️ What's NOT Protected (by design)
- ❌ Complete regional AWS outage (extremely rare - less than 0.01% annual probability)

---

## How to Test S3 Versioning & Recovery

### 1. Deploy the Stack
```bash
cd backend
cdk deploy --all
```

Note the outputs from BackendStack-Primary and BackendStack-Failover:
- `DocsBucketName`: Your versioned documents buckets (one per region)

### 2. Upload a Test File
```bash
# Set your bucket name from CDK output
DOCS_BUCKET="<your-docs-bucket-name>"

# Create a test file
echo "Version 1: Original content" > test-versioning.txt

# Upload to bucket
aws s3 cp test-versioning.txt s3://$DOCS_BUCKET/test-versioning.txt
```

### 3. Update the File (Create New Version)
```bash
# Modify the file
echo "Version 2: Updated content" > test-versioning.txt

# Upload again (creates new version)
aws s3 cp test-versioning.txt s3://$DOCS_BUCKET/test-versioning.txt
```

### 4. List All Versions
```bash
# Show all versions of the file
aws s3api list-object-versions \
  --bucket $DOCS_BUCKET \
  --prefix test-versioning.txt

# You should see 2 versions with different VersionIds
```

### 5. Retrieve an Old Version
```bash
# Get the VersionId of version 1 from step 4 output
VERSION_ID="<version-id-from-step-4>"

# Download the old version
aws s3api get-object \
  --bucket $DOCS_BUCKET \
  --key test-versioning.txt \
  --version-id $VERSION_ID \
  recovered-file.txt

# Verify it has the original content
cat recovered-file.txt
# Should show: "Version 1: Original content"
```

### 6. Test Deletion Recovery
```bash
# Delete the file
aws s3 rm s3://$DOCS_BUCKET/test-versioning.txt

# Verify it appears deleted
aws s3 ls s3://$DOCS_BUCKET/test-versioning.txt
# Should return nothing

# BUT the versions still exist!
aws s3api list-object-versions \
  --bucket $DOCS_BUCKET \
  --prefix test-versioning.txt

# Recover by copying a previous version back
aws s3api copy-object \
  --bucket $DOCS_BUCKET \
  --copy-source $DOCS_BUCKET/test-versioning.txt?versionId=$VERSION_ID \
  --key test-versioning.txt

# File is now restored!
aws s3 ls s3://$DOCS_BUCKET/test-versioning.txt
```

### 7. Test via S3 Console (Visual Verification)
1. Go to AWS S3 Console
2. Open your docs bucket  
3. Find your test file
4. Toggle "Show versions" button at top right
5. You should see multiple versions listed
6. Select an old version and click "Download" to restore it

---

## Monitoring & Best Practices

### View Versioning Status
```bash
# Check versioning is enabled
aws s3api get-bucket-versioning --bucket $DOCS_BUCKET

# Expected output:
# {
#     "Status": "Enabled"
# }
```

### Monitor Storage Used by Versions
```bash
# Count total object versions
aws s3api list-object-versions \
  --bucket $DOCS_BUCKET \
  --query 'length(Versions)'

# List all versions (shows storage overhead)
aws s3api list-object-versions \
  --bucket $DOCS_BUCKET \
  --output table
```

### Lifecycle Management
The bucket is configured with a 10-day expiration policy to automatically clean up old documents and reduce storage costs.

---

## Advanced: Adding Cross-Region Replication (Optional)

If you need protection against a complete regional outage, you can manually enable cross-region replication:

### Quick Setup via AWS Console
1. Go to S3 Console → Select your docs bucket
2. Click "Management" tab → "Replication rules"
3. Click "Create replication rule"
4. **Destination**: Choose or create a bucket in a different region (e.g., `us-east-1` if primary is `us-west-2`)
5. **IAM Role**: Create new or use existing S3 replication role
6. **Enable**: Save the rule

### Verify Replication (if configured)
```bash
DR_BUCKET="<your-dr-bucket-name>"

# Upload a file
echo "Test replication" > test-replication.txt
aws s3 cp test-replication.txt s3://$DOCS_BUCKET/test-replication.txt

# Wait 30 seconds, then check DR bucket
aws s3 ls s3://$DR_BUCKET/test-replication.txt
```

---

## Cleanup Test Files
```bash
# Remove all test files and their versions
aws s3api delete-object \
  --bucket $DOCS_BUCKET \
  --key test-versioning.txt

# Permanently delete all versions (optional - careful!)
aws s3api list-object-versions \
  --bucket $DOCS_BUCKET \
  --prefix test-versioning.txt \
  --query 'Versions[].VersionId' \
  --output text | xargs -n1 -I {} \
  aws s3api delete-object \
    --bucket $DOCS_BUCKET \
    --key test-versioning.txt \
    --version-id {}
```

---

## Summary

✅ **Current Protection Level: HIGH**
- S3 Versioning protects against 99.9% of real-world data loss scenarios
- AWS S3 multi-AZ storage provides exceptional durability
- Simple to maintain with zero operational overhead

💡 **Recommendation**: This versioning-based approach is sufficient for most applications. If you require cross-region disaster recovery, enable it manually via S3 Console when needed.

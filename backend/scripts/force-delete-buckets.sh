#!/bin/bash
# Force delete versioned S3 buckets by deleting all object versions

set -e

BUCKETS=(
  "intelligent-docs-02eb4233-1cbb-412b-9845-b4cbc7baa115"
  "intelligent-docs-1ca13d7c-5567-4344-9f10-e308ed229003"
  "intelligent-docs-2d2402c1-3c0d-42a2-b17c-f9c675579968"
  "intelligent-docs-434e53f2-709c-41bc-9786-ec3c316ce54d"
  "intelligent-docs-8a8db005-944d-4e99-96c3-44a3f8badbf0"
  "intelligent-docs-d3c06869-de91-4750-913e-b7d9869b8c55"
)

for bucket in "${BUCKETS[@]}"; do
  echo "🗑️  Deleting all versions from: $bucket"
  
  # Delete all object versions and delete markers
  aws s3api delete-objects \
    --bucket "$bucket" \
    --delete "$(aws s3api list-object-versions \
      --bucket "$bucket" \
      --output json \
      --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}, DeleteMarkers: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' 2>/dev/null)" \
    --region us-west-2 2>&1 | grep -v "NoSuchBucket" || echo "  (Bucket already empty or doesn't exist)"
  
  # Now delete the bucket
  aws s3api delete-bucket --bucket "$bucket" --region us-west-2 2>&1 && echo "  ✅ Deleted $bucket" || echo "  ⚠️  Bucket may still have versions or be locked"
  echo ""
done

echo "✅ Cleanup complete!"


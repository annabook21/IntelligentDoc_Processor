#!/bin/bash
# Script to delete old S3 buckets from previous deployments
# Usage: ./cleanup-old-buckets.sh [--dry-run]

set -e

DRY_RUN=${1:-"--dry-run"}
CURRENT_BUCKET=$(aws cloudformation describe-stack-resources \
  --stack-name SimplifiedDocProcessorStack \
  --region us-west-2 \
  --query 'StackResources[?ResourceType==`AWS::S3::Bucket` && contains(LogicalResourceId, `Documents`)].PhysicalResourceId' \
  --output text 2>/dev/null || echo "")

if [ -z "$CURRENT_BUCKET" ]; then
  echo "❌ Could not find current active bucket from stack"
  exit 1
fi

echo "✅ Current active bucket: $CURRENT_BUCKET"
echo ""
echo "Found old buckets:"

OLD_BUCKETS=$(aws s3api list-buckets \
  --query "Buckets[?contains(Name, 'intelligent-docs') && Name != '$CURRENT_BUCKET'].Name" \
  --output text)

if [ -z "$OLD_BUCKETS" ]; then
  echo "✅ No old buckets found - all clean!"
  exit 0
fi

for bucket in $OLD_BUCKETS; do
  echo "  - $bucket"
done

echo ""
if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "🔍 DRY RUN MODE - No buckets will be deleted"
  echo ""
  echo "To actually delete these buckets, run:"
  echo "  ./cleanup-old-buckets.sh --execute"
  exit 0
fi

echo "⚠️  WARNING: This will delete the following buckets:"
for bucket in $OLD_BUCKETS; do
  echo "  - $bucket"
done
echo ""
read -p "Are you sure you want to delete these buckets? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "❌ Cancelled"
  exit 0
fi

echo ""
echo "🗑️  Deleting buckets..."

for bucket in $OLD_BUCKETS; do
  echo "Deleting $bucket..."
  
  # Empty bucket first (required before deletion)
  aws s3 rm "s3://$bucket" --recursive 2>&1 || echo "  (Bucket already empty or failed to empty)"
  
  # Delete bucket
  aws s3api delete-bucket --bucket "$bucket" --region us-west-2 2>&1 && echo "  ✅ Deleted" || echo "  ❌ Failed to delete"
done

echo ""
echo "✅ Cleanup complete!"


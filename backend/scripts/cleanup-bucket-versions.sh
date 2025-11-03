#!/bin/bash
# Delete all object versions from versioned S3 buckets, then delete the bucket

set -e

for bucket in "$@"; do
  if [ -z "$bucket" ]; then
    continue
  fi
  
  echo "Cleaning up versioned bucket: $bucket"
  
  # Delete all object versions (including delete markers)
  aws s3api list-object-versions --bucket "$bucket" --region us-west-2 \
    --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}, DeleteMarkers: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' \
    --output json > /tmp/versions.json 2>&1 || echo "  No versions found or bucket doesn't exist"
  
  if [ -s /tmp/versions.json ] && grep -q '"Objects":\[' /tmp/versions.json && grep -q 'Key' /tmp/versions.json; then
    # Delete objects
    cat /tmp/versions.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
if 'Objects' in data and data['Objects']:
    print(json.dumps({'Objects': data['Objects'], 'Quiet': True}))
" | aws s3api delete-objects --bucket "$bucket" --delete file:///dev/stdin --region us-west-2 2>&1 || echo "  Failed to delete objects"
    
    # Delete delete markers
    cat /tmp/versions.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
if 'DeleteMarkers' in data and data['DeleteMarkers']:
    print(json.dumps({'Objects': data['DeleteMarkers'], 'Quiet': True}))
" | aws s3api delete-objects --bucket "$bucket" --delete file:///dev/stdin --region us-west-2 2>&1 || echo "  Failed to delete markers"
  fi
  
  # Now delete the bucket
  aws s3api delete-bucket --bucket "$bucket" --region us-west-2 2>&1 && echo "  ✅ Deleted $bucket" || echo "  ❌ Failed to delete $bucket"
  echo ""
done


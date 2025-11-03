#!/bin/bash

# Clean up all documents from S3 and DynamoDB
# This script is safe to run - it will delete all documents and metadata

set -e

REGION="us-west-2"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION_SHORT=$(echo $REGION | sed 's/-//g')

# Bucket and table names
BUCKET_NAME="intelligent-docs-${ACCOUNT_ID}-${REGION_SHORT}"
METADATA_TABLE="document-metadata-${REGION_SHORT}"
HASH_TABLE="document-hash-registry-${REGION_SHORT}"
DOCUMENT_NAME_TABLE="document-names-${REGION_SHORT}"

echo "===================================================================================  "
echo "CLEANUP ALL DOCUMENTS AND METADATA"
echo "==================================================================================="
echo ""
echo "This script will delete:"
echo "  - All objects from S3 bucket: ${BUCKET_NAME}"
echo "  - All items from DynamoDB table: ${METADATA_TABLE}"
echo "  - All items from DynamoDB table: ${HASH_TABLE}"
echo "  - All items from DynamoDB table: ${DOCUMENT_NAME_TABLE}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Cleanup cancelled."
  exit 0
fi

echo ""
echo "=== Cleaning up S3 bucket: ${BUCKET_NAME} ==="
echo ""

# Delete all object versions and delete markers
aws s3api list-object-versions \
  --bucket "$BUCKET_NAME" \
  --output json \
  --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' \
| jq -r '.Objects[] | "\(.Key) \(.VersionId)"' \
| while read key versionid; do
  if [ ! -z "$key" ]; then
    echo "Deleting version: $key ($versionid)"
    aws s3api delete-object --bucket "$BUCKET_NAME" --key "$key" --version-id "$versionid" > /dev/null
  fi
done

# Delete all delete markers
aws s3api list-object-versions \
  --bucket "$BUCKET_NAME" \
  --output json \
  --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' \
| jq -r '.Objects[] | "\(.Key) \(.VersionId)"' \
| while read key versionid; do
  if [ ! -z "$key" ]; then
    echo "Deleting delete marker: $key ($versionid)"
    aws s3api delete-object --bucket "$BUCKET_NAME" --key "$key" --version-id "$versionid" > /dev/null
  fi
done

# Delete all remaining objects (non-versioned)
aws s3 rm s3://${BUCKET_NAME}/ --recursive

echo ""
echo "✅ S3 bucket cleaned"
echo ""

echo "=== Cleaning up DynamoDB table: ${METADATA_TABLE} ==="
echo ""

# Scan and delete all items from metadata table
aws dynamodb scan \
  --table-name "$METADATA_TABLE" \
  --attributes-to-get documentId processingDate \
  --query 'Items[*].[documentId.S, processingDate.S]' \
  --output text \
| while read documentId processingDate; do
  if [ ! -z "$documentId" ]; then
    echo "Deleting metadata: $documentId ($processingDate)"
    aws dynamodb delete-item \
      --table-name "$METADATA_TABLE" \
      --key "{\"documentId\": {\"S\": \"$documentId\"}, \"processingDate\": {\"S\": \"$processingDate\"}}" \
      > /dev/null
  fi
done

echo ""
echo "✅ Metadata table cleaned"
echo ""

echo "=== Cleaning up DynamoDB table: ${HASH_TABLE} ==="
echo ""

# Scan and delete all items from hash table
aws dynamodb scan \
  --table-name "$HASH_TABLE" \
  --attributes-to-get contentHash \
  --query 'Items[*].contentHash.S' \
  --output text \
| while read contentHash; do
  if [ ! -z "$contentHash" ]; then
    echo "Deleting hash: $contentHash"
    aws dynamodb delete-item \
      --table-name "$HASH_TABLE" \
      --key "{\"contentHash\": {\"S\": \"$contentHash\"}}" \
      > /dev/null
  fi
done

echo ""
echo "✅ Hash table cleaned"
echo ""

echo "=== Cleaning up DynamoDB table: ${DOCUMENT_NAME_TABLE} ==="
echo ""

# Scan and delete all items from document name table
aws dynamodb scan \
  --table-name "$DOCUMENT_NAME_TABLE" \
  --attributes-to-get documentId \
  --query 'Items[*].documentId.S' \
  --output text \
| while read documentId; do
  if [ ! -z "$documentId" ]; then
    echo "Deleting document name mapping: $documentId"
    aws dynamodb delete-item \
      --table-name "$DOCUMENT_NAME_TABLE" \
      --key "{\"documentId\": {\"S\": \"$documentId\"}}" \
      > /dev/null
  fi
done

echo ""
echo "✅ Document name table cleaned"
echo ""
echo "==================================================================================="
echo "✅ ALL DOCUMENTS AND METADATA DELETED"
echo "==================================================================================="
echo ""
echo "You can now upload new documents with user-friendly names."


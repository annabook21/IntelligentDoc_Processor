#!/bin/bash
# Script to delete old DynamoDB tables from previous deployments
# Usage: ./cleanup-old-tables.sh [--dry-run]

set -e

DRY_RUN=${1:-"--dry-run"}
CURRENT_TABLE="document-metadata-uswest2"

echo "✅ Current active table: $CURRENT_TABLE"
echo ""
echo "Found old tables:"

OLD_TABLES=$(aws dynamodb list-tables \
  --region us-west-2 \
  --query "TableNames[?contains(@, 'document-metadata') && contains(@, 'us-west-2') && @ != '$CURRENT_TABLE']" \
  --output text)

if [ -z "$OLD_TABLES" ]; then
  echo "✅ No old tables found - all clean!"
  exit 0
fi

for table in $OLD_TABLES; do
  echo "  - $table"
done

echo ""
if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "🔍 DRY RUN MODE - No tables will be deleted"
  echo ""
  echo "To actually delete these tables, run:"
  echo "  ./cleanup-old-tables.sh --execute"
  exit 0
fi

echo "⚠️  WARNING: This will delete the following tables:"
for table in $OLD_TABLES; do
  echo "  - $table"
done
echo ""
read -p "Are you sure you want to delete these tables? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "❌ Cancelled"
  exit 0
fi

echo ""
echo "🗑️  Deleting tables..."

for table in $OLD_TABLES; do
  echo "Deleting $table..."
  
  # Disable deletion protection first
  aws dynamodb update-table \
    --table-name "$table" \
    --region us-west-2 \
    --no-deletion-protection-enabled 2>&1 || echo "  (Deletion protection already disabled or table doesn't exist)"
  
  # Delete table
  aws dynamodb delete-table \
    --table-name "$table" \
    --region us-west-2 2>&1 && echo "  ✅ Deleted" || echo "  ❌ Failed to delete (may need to wait for deletion protection to be disabled)"
done

echo ""
echo "✅ Cleanup complete!"


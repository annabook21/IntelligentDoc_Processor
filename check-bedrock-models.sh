#!/bin/bash
set -e

# Check Bedrock Model Availability Script
# Verifies required models are enabled before deployment

REQUIRED_MODELS=(
  "amazon.titan-embed-text-v1"
  "anthropic.claude-3-sonnet-20240229-v1:0"
)

REGION="${1:-us-west-2}"

echo "=========================================="
echo "Bedrock Model Availability Check"
echo "Region: $REGION"
echo "=========================================="
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
  echo "❌ Error: AWS CLI not configured or credentials invalid"
  echo "   Run: aws configure"
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "✅ AWS Account: $ACCOUNT_ID"
echo ""

# Fetch available models
echo "Fetching available models in $REGION..."
MODELS_JSON=$(aws bedrock list-foundation-models --region $REGION 2>&1)

if [ $? -ne 0 ]; then
  echo "❌ Error accessing Bedrock in region $REGION"
  echo "   This could mean:"
  echo "   - Bedrock is not available in this region"
  echo "   - You don't have permissions to access Bedrock"
  echo ""
  echo "Error details:"
  echo "$MODELS_JSON"
  exit 1
fi

# Check each required model
ALL_AVAILABLE=true

for model_id in "${REQUIRED_MODELS[@]}"; do
  if echo "$MODELS_JSON" | grep -q "$model_id"; then
    echo "✅ $model_id - Available"
  else
    echo "❌ $model_id - NOT AVAILABLE"
    ALL_AVAILABLE=false
  fi
done

echo ""
echo "=========================================="

if [ "$ALL_AVAILABLE" = true ]; then
  echo "✅ SUCCESS: All required models are available in $REGION"
  echo ""
  echo "You can proceed with deployment:"
  echo "  export AWS_DEFAULT_REGION=$REGION"
  echo "  cdk bootstrap aws://$ACCOUNT_ID/$REGION"
  echo "  cdk deploy"
  exit 0
else
  echo "❌ FAILURE: Some models are not available in $REGION"
  echo ""
  echo "Action Required:"
  echo "1. Go to: https://$REGION.console.aws.amazon.com/bedrock/home?region=$REGION#/modelaccess"
  echo "2. Click 'Manage model access'"
  echo "3. Enable the missing models listed above"
  echo "4. Click 'Save changes'"
  echo "5. Wait 2-3 minutes for access to be granted"
  echo "6. Run this script again to verify"
  echo ""
  echo "Then re-run: ./check-bedrock-models.sh $REGION"
  exit 1
fi


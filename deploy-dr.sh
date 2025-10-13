#!/bin/bash
set -e

# Multi-Region DR Deployment Script
# Automates deployment to primary and failover regions with health checks

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
PRIMARY_REGION="${PRIMARY_REGION:-us-west-2}"
FAILOVER_REGION="${FAILOVER_REGION:-us-east-1}"
SKIP_MODEL_CHECK="${SKIP_MODEL_CHECK:-false}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --primary)
      PRIMARY_REGION="$2"
      shift 2
      ;;
    --failover)
      FAILOVER_REGION="$2"
      shift 2
      ;;
    --skip-model-check)
      SKIP_MODEL_CHECK=true
      shift
      ;;
    --help)
      echo "Usage: ./deploy-dr.sh [options]"
      echo ""
      echo "Options:"
      echo "  --primary REGION       Primary region (default: us-west-2)"
      echo "  --failover REGION      Failover region (default: us-east-1)"
      echo "  --skip-model-check     Skip Bedrock model availability check"
      echo "  --help                 Show this help message"
      echo ""
      echo "Environment variables:"
      echo "  PRIMARY_REGION         Same as --primary"
      echo "  FAILOVER_REGION        Same as --failover"
      echo "  SKIP_MODEL_CHECK       Set to 'true' to skip model check"
      echo ""
      echo "Example:"
      echo "  ./deploy-dr.sh --primary us-west-2 --failover us-east-1"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run ./deploy-dr.sh --help for usage"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}=========================================="
echo "Multi-Region DR Deployment"
echo "==========================================${NC}"
echo "Primary Region:  $PRIMARY_REGION"
echo "Failover Region: $FAILOVER_REGION"
echo ""

# Step 1: Verify AWS credentials
echo -e "${YELLOW}[Step 1/7]${NC} Verifying AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
  echo -e "${RED}❌ Error: AWS CLI not configured${NC}"
  echo "Run: aws configure"
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}✅ Account ID: $ACCOUNT_ID${NC}"
echo ""

# Step 2: Check Bedrock models in both regions
if [ "$SKIP_MODEL_CHECK" != "true" ]; then
  echo -e "${YELLOW}[Step 2/7]${NC} Checking Bedrock model availability..."
  
  echo "Checking primary region ($PRIMARY_REGION)..."
  if ! ./check-bedrock-models.sh $PRIMARY_REGION; then
    echo -e "${RED}❌ Bedrock models not available in $PRIMARY_REGION${NC}"
    echo "Enable them in the Bedrock console, then re-run this script."
    exit 1
  fi
  
  echo ""
  echo "Checking failover region ($FAILOVER_REGION)..."
  if ! ./check-bedrock-models.sh $FAILOVER_REGION; then
    echo -e "${RED}❌ Bedrock models not available in $FAILOVER_REGION${NC}"
    echo "Enable them in the Bedrock console, then re-run this script."
    exit 1
  fi
  
  echo -e "${GREEN}✅ All required models available in both regions${NC}"
else
  echo -e "${YELLOW}⚠️  Skipping model availability check${NC}"
fi
echo ""

# Step 3: Bootstrap primary region
echo -e "${YELLOW}[Step 3/7]${NC} Bootstrapping primary region ($PRIMARY_REGION)..."
if aws cloudformation describe-stacks --stack-name CDKToolkit --region $PRIMARY_REGION &> /dev/null; then
  echo -e "${GREEN}✅ Primary region already bootstrapped${NC}"
else
  echo "Bootstrapping $PRIMARY_REGION..."
  cdk bootstrap aws://$ACCOUNT_ID/$PRIMARY_REGION
  echo -e "${GREEN}✅ Primary region bootstrapped${NC}"
fi
echo ""

# Step 4: Bootstrap failover region
echo -e "${YELLOW}[Step 4/7]${NC} Bootstrapping failover region ($FAILOVER_REGION)..."
if aws cloudformation describe-stacks --stack-name CDKToolkit --region $FAILOVER_REGION &> /dev/null; then
  echo -e "${GREEN}✅ Failover region already bootstrapped${NC}"
else
  echo "Bootstrapping $FAILOVER_REGION..."
  cdk bootstrap aws://$ACCOUNT_ID/$FAILOVER_REGION
  echo -e "${GREEN}✅ Failover region bootstrapped${NC}"
fi
echo ""

# Step 5: Deploy to primary region
echo -e "${YELLOW}[Step 5/7]${NC} Deploying to primary region ($PRIMARY_REGION)..."
export AWS_DEFAULT_REGION=$PRIMARY_REGION
cd backend

echo "Running: cdk deploy --require-approval never"
cdk deploy --require-approval never

# Get primary outputs
PRIMARY_API_URL=$(aws cloudformation describe-stacks \
  --stack-name BackendStack \
  --region $PRIMARY_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`APIGatewayUrl`].OutputValue' \
  --output text)

PRIMARY_HEALTH_URL=$(aws cloudformation describe-stacks \
  --stack-name BackendStack \
  --region $PRIMARY_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`HealthEndpoint`].OutputValue' \
  --output text)

PRIMARY_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name BackendStack \
  --region $PRIMARY_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`DocsBucketName`].OutputValue' \
  --output text)

echo -e "${GREEN}✅ Primary region deployed${NC}"
echo "   API URL: $PRIMARY_API_URL"
echo "   Health: $PRIMARY_HEALTH_URL"
echo "   Bucket: $PRIMARY_BUCKET"
echo ""

# Step 6: Deploy to failover region
echo -e "${YELLOW}[Step 6/7]${NC} Deploying to failover region ($FAILOVER_REGION)..."
export AWS_DEFAULT_REGION=$FAILOVER_REGION

echo "Running: cdk deploy --require-approval never"
cdk deploy --require-approval never

# Get failover outputs
FAILOVER_API_URL=$(aws cloudformation describe-stacks \
  --stack-name BackendStack \
  --region $FAILOVER_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`APIGatewayUrl`].OutputValue' \
  --output text)

FAILOVER_HEALTH_URL=$(aws cloudformation describe-stacks \
  --stack-name BackendStack \
  --region $FAILOVER_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`HealthEndpoint`].OutputValue' \
  --output text)

FAILOVER_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name BackendStack \
  --region $FAILOVER_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`DocsBucketName`].OutputValue' \
  --output text)

echo -e "${GREEN}✅ Failover region deployed${NC}"
echo "   API URL: $FAILOVER_API_URL"
echo "   Health: $FAILOVER_HEALTH_URL"
echo "   Bucket: $FAILOVER_BUCKET"
echo ""

# Step 7: Test both health endpoints
echo -e "${YELLOW}[Step 7/7]${NC} Testing health endpoints..."

echo "Testing primary ($PRIMARY_REGION)..."
PRIMARY_HEALTH=$(curl -s $PRIMARY_HEALTH_URL | jq -r '.status' 2>/dev/null || echo "error")
if [ "$PRIMARY_HEALTH" = "healthy" ]; then
  echo -e "${GREEN}✅ Primary health check: HEALTHY${NC}"
else
  echo -e "${RED}❌ Primary health check: FAILED${NC}"
  echo "   Response: $(curl -s $PRIMARY_HEALTH_URL)"
fi

echo "Testing failover ($FAILOVER_REGION)..."
FAILOVER_HEALTH=$(curl -s $FAILOVER_HEALTH_URL | jq -r '.status' 2>/dev/null || echo "error")
if [ "$FAILOVER_HEALTH" = "healthy" ]; then
  echo -e "${GREEN}✅ Failover health check: HEALTHY${NC}"
else
  echo -e "${RED}❌ Failover health check: FAILED${NC}"
  echo "   Response: $(curl -s $FAILOVER_HEALTH_URL)"
fi

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Primary Region ($PRIMARY_REGION):"
echo "  API URL:    $PRIMARY_API_URL"
echo "  Health URL: $PRIMARY_HEALTH_URL"
echo "  Docs Bucket: $PRIMARY_BUCKET"
echo ""
echo "Failover Region ($FAILOVER_REGION):"
echo "  API URL:    $FAILOVER_API_URL"
echo "  Health URL: $FAILOVER_HEALTH_URL"
echo "  Docs Bucket: $FAILOVER_BUCKET"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Configure S3 Cross-Region Replication (see DISASTER_RECOVERY_SETUP.md Step 5)"
echo "2. Set up Route 53 health checks (see DISASTER_RECOVERY_SETUP.md Step 6)"
echo "3. Configure Route 53 failover routing (see DISASTER_RECOVERY_SETUP.md Step 7)"
echo ""
echo "Or run the automated setup:"
echo "  ./setup-route53-dr.sh --primary-health $PRIMARY_HEALTH_URL --failover-health $FAILOVER_HEALTH_URL"
echo ""

# Save outputs to file for easy reference
cat > dr-deployment-outputs.txt << EOF
# DR Deployment Outputs
# Generated: $(date)

PRIMARY_REGION=$PRIMARY_REGION
PRIMARY_API_URL=$PRIMARY_API_URL
PRIMARY_HEALTH_URL=$PRIMARY_HEALTH_URL
PRIMARY_BUCKET=$PRIMARY_BUCKET

FAILOVER_REGION=$FAILOVER_REGION
FAILOVER_API_URL=$FAILOVER_API_URL
FAILOVER_HEALTH_URL=$FAILOVER_HEALTH_URL
FAILOVER_BUCKET=$FAILOVER_BUCKET

ACCOUNT_ID=$ACCOUNT_ID
EOF

echo -e "${GREEN}✅ Deployment details saved to: dr-deployment-outputs.txt${NC}"


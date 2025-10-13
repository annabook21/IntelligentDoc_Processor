#!/bin/bash
set -e

# Master Deployment Script for Chatbot with Disaster Recovery
# This script automates the ENTIRE DR setup process

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${GREEN}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     AWS Contextual Chatbot with Disaster Recovery            ║
║     Automated Multi-Region Deployment                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Default values
PRIMARY_REGION="${PRIMARY_REGION:-us-west-2}"
FAILOVER_REGION="${FAILOVER_REGION:-us-east-1}"
DOMAIN=""
SETUP_ROUTE53="true"

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
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --no-route53)
      SETUP_ROUTE53="false"
      shift
      ;;
    --help)
      cat << EOF
Usage: ./deploy-chatbot-with-dr.sh [options]

This script automates the complete DR setup:
  1. Checks Bedrock model availability in both regions
  2. Bootstraps both regions
  3. Deploys full stack to primary region
  4. Deploys full stack to failover region
  5. Creates Route 53 health checks
  6. Configures failover routing (if domain provided)

Options:
  --primary REGION       Primary region (default: us-west-2)
  --failover REGION      Failover region (default: us-east-1)
  --domain DOMAIN        Your custom domain for Route 53 failover (optional)
  --no-route53           Skip Route 53 configuration
  --help                 Show this help message

Examples:
  # Deploy with all defaults (us-west-2 → us-east-1)
  ./deploy-chatbot-with-dr.sh

  # Deploy with custom regions
  ./deploy-chatbot-with-dr.sh --primary us-west-2 --failover us-east-1

  # Deploy with custom domain for failover
  ./deploy-chatbot-with-dr.sh --domain api.example.com

  # Deploy without Route 53 (just deploys to both regions)
  ./deploy-chatbot-with-dr.sh --no-route53

Prerequisites:
  - AWS CLI configured with valid credentials
  - Docker Desktop running
  - CDK CLI installed (npm install -g aws-cdk)
  - jq installed (brew install jq)
  - Bedrock model access enabled in BOTH regions (script will check)

EOF
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Run ./deploy-chatbot-with-dr.sh --help for usage"
      exit 1
      ;;
  esac
done

echo "Configuration:"
echo "  Primary Region:  $PRIMARY_REGION"
echo "  Failover Region: $FAILOVER_REGION"
echo "  Custom Domain:   ${DOMAIN:-none}"
echo "  Route 53 Setup:  $SETUP_ROUTE53"
echo ""

read -p "Proceed with deployment? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Deployment cancelled."
  exit 0
fi
echo ""

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
  echo -e "${RED}❌ AWS CLI not found. Install: https://aws.amazon.com/cli/${NC}"
  exit 1
fi

# Check jq
if ! command -v jq &> /dev/null; then
  echo -e "${YELLOW}⚠️  jq not found. Install: brew install jq (macOS) or apt-get install jq (Linux)${NC}"
  echo "   Continuing without jq (some features may not work)..."
fi

# Check Docker
if ! docker ps &> /dev/null; then
  echo -e "${RED}❌ Docker not running. Start Docker Desktop and try again.${NC}"
  exit 1
fi

# Check CDK
if ! command -v cdk &> /dev/null; then
  echo -e "${RED}❌ CDK CLI not found. Install: npm install -g aws-cdk${NC}"
  exit 1
fi

echo -e "${GREEN}✅ All prerequisites met${NC}"
echo ""

# Run main deployment
echo -e "${BOLD}Starting deployment...${NC}"
echo ""

./deploy-dr.sh --primary $PRIMARY_REGION --failover $FAILOVER_REGION

# Check if deployment succeeded
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ Deployment failed${NC}"
  exit 1
fi

# Setup Route 53 if requested
if [ "$SETUP_ROUTE53" = "true" ]; then
  echo ""
  if [ -n "$DOMAIN" ]; then
    ./setup-route53-dr.sh --domain $DOMAIN
  else
    ./setup-route53-dr.sh
  fi
  
  if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Route 53 setup failed, but deployments succeeded${NC}"
    echo "   You can run ./setup-route53-dr.sh manually later"
  fi
fi

# Final summary
echo ""
echo -e "${BOLD}${GREEN}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║              ✅ DEPLOYMENT SUCCESSFUL ✅                       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

if [ -f dr-deployment-outputs.txt ]; then
  echo "Deployment details:"
  cat dr-deployment-outputs.txt | grep -E "(PRIMARY|FAILOVER)_(API|HEALTH)_URL"
fi

echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "1. Test primary health: curl \$(grep PRIMARY_HEALTH_URL dr-deployment-outputs.txt | cut -d'=' -f2)"
echo "2. Test failover health: curl \$(grep FAILOVER_HEALTH_URL dr-deployment-outputs.txt | cut -d'=' -f2)"
echo "3. Upload documents to test replication"
echo "4. Review CloudWatch dashboards in both regions"
echo ""
echo -e "${BLUE}For detailed monitoring and testing, see:${NC}"
echo "  - dr-deployment-outputs.txt (deployment details)"
echo "  - dr-route53-config.txt (health check IDs)"
echo "  - DISASTER_RECOVERY_SETUP.md (complete guide)"
echo ""


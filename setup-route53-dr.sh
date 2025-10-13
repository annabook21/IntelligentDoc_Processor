#!/bin/bash
set -e

# Route 53 Health Check and Failover Setup Script
# Automates Route 53 configuration for multi-region DR

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if outputs file exists
if [ -f dr-deployment-outputs.txt ]; then
  echo -e "${BLUE}Loading deployment outputs...${NC}"
  source dr-deployment-outputs.txt
else
  echo -e "${RED}❌ Error: dr-deployment-outputs.txt not found${NC}"
  echo "Run ./deploy-dr.sh first to deploy both regions"
  exit 1
fi

# Parse arguments
DOMAIN=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --help)
      echo "Usage: ./setup-route53-dr.sh [options]"
      echo ""
      echo "Options:"
      echo "  --domain DOMAIN        Your custom domain (optional)"
      echo "  --help                 Show this help message"
      echo ""
      echo "Examples:"
      echo "  # With custom domain"
      echo "  ./setup-route53-dr.sh --domain api.example.com"
      echo ""
      echo "  # Without custom domain (just creates health checks)"
      echo "  ./setup-route53-dr.sh"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}=========================================="
echo "Route 53 DR Configuration"
echo "==========================================${NC}"
echo "Primary:  $PRIMARY_REGION"
echo "Failover: $FAILOVER_REGION"
if [ -n "$DOMAIN" ]; then
  echo "Domain:   $DOMAIN"
else
  echo "Domain:   (none - health checks only)"
fi
echo ""

# Step 1: Create health check for primary
echo -e "${YELLOW}[1/6]${NC} Creating health check for primary region..."

# Extract domain from health URL
PRIMARY_DOMAIN=$(echo $PRIMARY_HEALTH_URL | sed 's|https://||' | sed 's|/prod/health||')

PRIMARY_HC_OUTPUT=$(aws route53 create-health-check \
  --caller-reference primary-chatbot-$(date +%s) \
  --health-check-config \
    Type=HTTPS,\
ResourcePath=/prod/health,\
FullyQualifiedDomainName=$PRIMARY_DOMAIN,\
Port=443,\
RequestInterval=30,\
FailureThreshold=3,\
MeasureLatency=true \
  --health-check-tags Key=Name,Value=chatbot-primary-$PRIMARY_REGION Key=Region,Value=$PRIMARY_REGION 2>&1)

if [ $? -eq 0 ]; then
  PRIMARY_HC_ID=$(echo $PRIMARY_HC_OUTPUT | jq -r '.HealthCheck.Id')
  echo -e "${GREEN}✅ Primary health check created: $PRIMARY_HC_ID${NC}"
else
  if echo "$PRIMARY_HC_OUTPUT" | grep -q "HealthCheckAlreadyExists"; then
    echo -e "${YELLOW}⚠️  Health check already exists, retrieving ID...${NC}"
    PRIMARY_HC_ID=$(aws route53 list-health-checks \
      --query "HealthChecks[?HealthCheckConfig.FullyQualifiedDomainName=='$PRIMARY_DOMAIN'].Id" \
      --output text | head -1)
    echo -e "${GREEN}✅ Using existing health check: $PRIMARY_HC_ID${NC}"
  else
    echo -e "${RED}❌ Failed to create health check${NC}"
    echo "$PRIMARY_HC_OUTPUT"
    exit 1
  fi
fi

# Step 2: Create health check for failover
echo -e "${YELLOW}[2/6]${NC} Creating health check for failover region..."

FAILOVER_DOMAIN=$(echo $FAILOVER_HEALTH_URL | sed 's|https://||' | sed 's|/prod/health||')

FAILOVER_HC_OUTPUT=$(aws route53 create-health-check \
  --caller-reference failover-chatbot-$(date +%s) \
  --health-check-config \
    Type=HTTPS,\
ResourcePath=/prod/health,\
FullyQualifiedDomainName=$FAILOVER_DOMAIN,\
Port=443,\
RequestInterval=30,\
FailureThreshold=3,\
MeasureLatency=true \
  --health-check-tags Key=Name,Value=chatbot-failover-$FAILOVER_REGION Key=Region,Value=$FAILOVER_REGION 2>&1)

if [ $? -eq 0 ]; then
  FAILOVER_HC_ID=$(echo $FAILOVER_HC_OUTPUT | jq -r '.HealthCheck.Id')
  echo -e "${GREEN}✅ Failover health check created: $FAILOVER_HC_ID${NC}"
else
  if echo "$FAILOVER_HC_OUTPUT" | grep -q "HealthCheckAlreadyExists"; then
    echo -e "${YELLOW}⚠️  Health check already exists, retrieving ID...${NC}"
    FAILOVER_HC_ID=$(aws route53 list-health-checks \
      --query "HealthChecks[?HealthCheckConfig.FullyQualifiedDomainName=='$FAILOVER_DOMAIN'].Id" \
      --output text | head -1)
    echo -e "${GREEN}✅ Using existing health check: $FAILOVER_HC_ID${NC}"
  else
    echo -e "${RED}❌ Failed to create health check${NC}"
    echo "$FAILOVER_HC_OUTPUT"
    exit 1
  fi
fi

# Step 3: Wait for health checks to stabilize
echo -e "${YELLOW}[3/6]${NC} Waiting for health checks to stabilize (30 seconds)..."
sleep 30

# Step 4: Verify health checks
echo -e "${YELLOW}[4/6]${NC} Verifying health check status..."

PRIMARY_STATUS=$(aws route53 get-health-check-status \
  --health-check-id $PRIMARY_HC_ID \
  --query 'HealthCheckObservations[0].StatusReport.Status' \
  --output text)

FAILOVER_STATUS=$(aws route53 get-health-check-status \
  --health-check-id $FAILOVER_HC_ID \
  --query 'HealthCheckObservations[0].StatusReport.Status' \
  --output text)

if [ "$PRIMARY_STATUS" = "Success" ]; then
  echo -e "${GREEN}✅ Primary health check: PASSING${NC}"
else
  echo -e "${RED}⚠️  Primary health check: $PRIMARY_STATUS${NC}"
  echo "   This may take a few minutes to start passing"
fi

if [ "$FAILOVER_STATUS" = "Success" ]; then
  echo -e "${GREEN}✅ Failover health check: PASSING${NC}"
else
  echo -e "${RED}⚠️  Failover health check: $FAILOVER_STATUS${NC}"
  echo "   This may take a few minutes to start passing"
fi
echo ""

# Step 5: Configure failover routing (if domain provided)
if [ -n "$DOMAIN" ]; then
  echo -e "${YELLOW}[5/6]${NC} Configuring Route 53 failover routing for $DOMAIN..."
  
  # Get hosted zone ID
  HOSTED_ZONE_ID=$(aws route53 list-hosted-zones \
    --query "HostedZones[?Name=='${DOMAIN%.}.'].Id" \
    --output text | cut -d'/' -f3)
  
  if [ -z "$HOSTED_ZONE_ID" ]; then
    echo -e "${RED}❌ Error: No hosted zone found for $DOMAIN${NC}"
    echo "   Create a hosted zone first or omit --domain to skip this step"
  else
    echo "Found hosted zone: $HOSTED_ZONE_ID"
    
    # Create primary record
    cat > /tmp/primary-record.json << EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "$DOMAIN",
      "Type": "CNAME",
      "SetIdentifier": "Primary-$PRIMARY_REGION",
      "Failover": "PRIMARY",
      "TTL": 60,
      "ResourceRecords": [{"Value": "$PRIMARY_DOMAIN"}],
      "HealthCheckId": "$PRIMARY_HC_ID"
    }
  }]
}
EOF
    
    aws route53 change-resource-record-sets \
      --hosted-zone-id $HOSTED_ZONE_ID \
      --change-batch file:///tmp/primary-record.json
    
    echo -e "${GREEN}✅ Primary DNS record created${NC}"
    
    # Create failover record
    cat > /tmp/failover-record.json << EOF
{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "$DOMAIN",
      "Type": "CNAME",
      "SetIdentifier": "Failover-$FAILOVER_REGION",
      "Failover": "SECONDARY",
      "TTL": 60,
      "ResourceRecords": [{"Value": "$FAILOVER_DOMAIN"}],
      "HealthCheckId": "$FAILOVER_HC_ID"
    }
  }]
}
EOF
    
    aws route53 change-resource-record-sets \
      --hosted-zone-id $HOSTED_ZONE_ID \
      --change-batch file:///tmp/failover-record.json
    
    echo -e "${GREEN}✅ Failover DNS record created${NC}"
    echo ""
    echo "DNS configured: $DOMAIN"
    echo "  → Primary (when healthy): $PRIMARY_DOMAIN"
    echo "  → Failover (when primary down): $FAILOVER_DOMAIN"
  fi
else
  echo -e "${YELLOW}[5/6]${NC} Skipping Route 53 failover routing (no domain provided)"
  echo "   Health checks created but no DNS failover configured"
fi
echo ""

# Step 6: Save configuration
echo -e "${YELLOW}[6/6]${NC} Saving DR configuration..."

cat > dr-route53-config.txt << EOF
# Route 53 DR Configuration
# Generated: $(date)

PRIMARY_HEALTH_CHECK_ID=$PRIMARY_HC_ID
FAILOVER_HEALTH_CHECK_ID=$FAILOVER_HC_ID
PRIMARY_HEALTH_URL=$PRIMARY_HEALTH_URL
FAILOVER_HEALTH_URL=$FAILOVER_HEALTH_URL
PRIMARY_REGION=$PRIMARY_REGION
FAILOVER_REGION=$FAILOVER_REGION
DOMAIN=${DOMAIN:-none}

# To check health status:
aws route53 get-health-check-status --health-check-id $PRIMARY_HC_ID
aws route53 get-health-check-status --health-check-id $FAILOVER_HC_ID

# To delete health checks (cleanup):
aws route53 delete-health-check --health-check-id $PRIMARY_HC_ID
aws route53 delete-health-check --health-check-id $FAILOVER_HC_ID
EOF

echo -e "${GREEN}✅ Configuration saved to: dr-route53-config.txt${NC}"
echo ""

echo -e "${GREEN}=========================================="
echo "✅ DR Setup Complete!"
echo "==========================================${NC}"
echo ""
echo "What was configured:"
echo "  ✅ Health checks monitoring both regions every 30 seconds"
echo "  ✅ Automatic failover after 3 failures (90 seconds)"
if [ -n "$DOMAIN" ]; then
  echo "  ✅ DNS failover routing configured for $DOMAIN"
else
  echo "  ⚠️  DNS failover not configured (no domain provided)"
fi
echo ""
echo "Monitor health checks:"
echo "  aws route53 get-health-check-status --health-check-id $PRIMARY_HC_ID"
echo "  aws route53 get-health-check-status --health-check-id $FAILOVER_HC_ID"
echo ""
echo "View in console:"
echo "  https://console.aws.amazon.com/route53/healthchecks/home#/health-check-details/$PRIMARY_HC_ID"
echo ""


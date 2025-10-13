# Automation Scripts Guide

## Overview

Three automation scripts to simplify multi-region DR deployment:

| Script | Purpose | Usage |
|--------|---------|-------|
| `check-bedrock-models.sh` | Verify model availability | `./check-bedrock-models.sh us-east-1` |
| `deploy-dr.sh` | Deploy to both regions | `./deploy-dr.sh` |
| `setup-route53-dr.sh` | Configure Route 53 failover | `./setup-route53-dr.sh --domain api.example.com` |
| `deploy-chatbot-with-dr.sh` | **Master script** - does everything | `./deploy-chatbot-with-dr.sh` |

---

## Quick Start (Recommended)

### For Other Users Deploying This Application:

**Single Command Deployment:**

```bash
# Clone the repository
git clone <your-repo-url>
cd Chatbot_proto

# Run master deployment script
./deploy-chatbot-with-dr.sh
```

**That's it!** The script will:
1. Check your AWS credentials
2. Verify Bedrock models are enabled
3. Bootstrap both regions
4. Deploy to primary (us-west-2)
5. Deploy to failover (us-east-1)
6. Create health checks
7. Test both deployments

**Time:** ~25-30 minutes total

---

## Script Details

### 1. check-bedrock-models.sh

**Purpose:** Verify required Bedrock models are available before deployment

**Usage:**
```bash
# Check us-west-2
./check-bedrock-models.sh us-west-2

# Check us-east-1
./check-bedrock-models.sh us-east-1
```

**What it checks:**
- ✅ AWS CLI configured
- ✅ `amazon.titan-embed-text-v1` available
- ✅ `anthropic.claude-3-sonnet-20240229-v1:0` available

**Output:**
```
✅ amazon.titan-embed-text-v1 - Available
✅ anthropic.claude-3-sonnet-20240229-v1:0 - Available
✅ SUCCESS: All required models are available
```

**If models missing:**
```
❌ anthropic.claude-3-sonnet-20240229-v1:0 - NOT AVAILABLE
❌ FAILURE: Some models are not available

Action Required:
1. Go to: https://us-east-1.console.aws.amazon.com/bedrock/...
2. Click 'Manage model access'
3. Enable the missing models
```

**When to use:** Before deploying to a new region for the first time

---

### 2. deploy-dr.sh

**Purpose:** Deploy to both primary and failover regions automatically

**Usage:**
```bash
# Deploy with defaults (us-west-2 → us-east-1)
./deploy-dr.sh

# Deploy to custom regions
./deploy-dr.sh --primary us-west-2 --failover us-east-1

# Skip model check (if you already verified)
./deploy-dr.sh --skip-model-check
```

**What it does:**
1. Verifies AWS credentials
2. Checks Bedrock models in both regions (unless skipped)
3. Bootstraps primary region (if needed)
4. Bootstraps failover region (if needed)
5. Deploys full stack to primary
6. Deploys full stack to failover
7. Tests both health endpoints
8. Saves outputs to `dr-deployment-outputs.txt`

**Time:** ~20-25 minutes

**Output files:**
- `dr-deployment-outputs.txt` - URLs, bucket names, region info

---

### 3. setup-route53-dr.sh

**Purpose:** Configure Route 53 health checks and failover routing

**Prerequisites:** Run `deploy-dr.sh` first (needs dr-deployment-outputs.txt)

**Usage:**
```bash
# Create health checks only (no custom domain)
./setup-route53-dr.sh

# Create health checks AND configure DNS failover
./setup-route53-dr.sh --domain api.yourdomain.com
```

**What it does:**
1. Loads deployment outputs from `dr-deployment-outputs.txt`
2. Creates Route 53 health check for primary region
3. Creates Route 53 health check for failover region
4. Waits for health checks to stabilize
5. Verifies health check status
6. (Optional) Configures DNS failover routing for custom domain
7. Saves configuration to `dr-route53-config.txt`

**Time:** ~2-3 minutes

**Output files:**
- `dr-route53-config.txt` - Health check IDs, monitoring commands

**Health Check Configuration:**
- Checks every **30 seconds**
- Fails after **3 consecutive failures** (90 seconds)
- Measures latency for monitoring

---

### 4. deploy-chatbot-with-dr.sh (Master Script)

**Purpose:** One-command deployment of everything

**Usage:**
```bash
# Simple deployment (no custom domain)
./deploy-chatbot-with-dr.sh

# With custom domain for failover
./deploy-chatbot-with-dr.sh --domain api.yourdomain.com

# Custom regions
./deploy-chatbot-with-dr.sh --primary us-west-2 --failover us-east-1 --domain api.example.com
```

**What it does:**
1. Shows deployment configuration
2. Asks for confirmation
3. Checks prerequisites (AWS CLI, Docker, CDK, jq)
4. Runs `deploy-dr.sh`
5. Runs `setup-route53-dr.sh`
6. Displays final summary

**Time:** ~25-30 minutes

**Perfect for:** New users deploying the application for the first time

---

## Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│  User runs: ./deploy-chatbot-with-dr.sh                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  1. Check Prerequisites                                      │
│     - AWS CLI configured?                                    │
│     - Docker running?                                        │
│     - CDK installed?                                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. Check Bedrock Models (via check-bedrock-models.sh)      │
│     - Run in us-west-2                                       │
│     - Run in us-east-1                                       │
│     - Exit if models missing                                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Bootstrap Regions (via deploy-dr.sh)                     │
│     - Bootstrap us-west-2 (if needed)                        │
│     - Bootstrap us-east-1 (if needed)                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Deploy Primary (via deploy-dr.sh)                        │
│     - export AWS_DEFAULT_REGION=us-west-2                   │
│     - cdk deploy                                             │
│     - Save outputs                                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  5. Deploy Failover (via deploy-dr.sh)                       │
│     - export AWS_DEFAULT_REGION=us-east-1                   │
│     - cdk deploy                                             │
│     - Save outputs                                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  6. Setup Route 53 (via setup-route53-dr.sh)                 │
│     - Create health check for primary                        │
│     - Create health check for failover                       │
│     - Configure DNS failover (if domain provided)            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  7. Success Summary                                          │
│     - Show all URLs                                          │
│     - Show health check IDs                                  │
│     - Show next steps                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## For Other Users

### What They Need to Do Once (Per AWS Account):

1. **Install prerequisites:**
   ```bash
   # Install AWS CLI
   # Install Docker Desktop
   # Install Node.js
   npm install -g aws-cdk
   ```

2. **Configure AWS credentials:**
   ```bash
   aws configure
   ```

3. **Enable Bedrock model access:**
   - Go to Bedrock Console → Model Access
   - Enable `amazon.titan-embed-text-v1`
   - Enable `anthropic.claude-3-sonnet-20240229-v1:0`
   - Do this in **both** us-west-2 and us-east-1

### What They Run Every Time (Automated):

```bash
# Single command
./deploy-chatbot-with-dr.sh
```

**That's it!** No manual AWS console steps for deployment.

---

## Updating Existing Deployments

To update already-deployed stacks in both regions:

```bash
# Pull latest code
git pull origin main

# Re-run deployment
./deploy-dr.sh
```

The script detects existing deployments and updates them (won't recreate from scratch).

---

## Cleanup

To remove everything:

```bash
# Destroy both regions
export AWS_DEFAULT_REGION=us-west-2
cd backend && cdk destroy

export AWS_DEFAULT_REGION=us-east-1
cdk destroy

# Delete health checks (get IDs from dr-route53-config.txt)
aws route53 delete-health-check --health-check-id <PRIMARY_HC_ID>
aws route53 delete-health-check --health-check-id <FAILOVER_HC_ID>
```

---

## Troubleshooting

### "Bedrock models not available"

**Solution:** The script will tell you exactly which models to enable and provide the console URL.

### "Bootstrap failed"

**Cause:** Insufficient IAM permissions

**Solution:** Ensure your IAM user/role has `AdministratorAccess` or at minimum:
- `cloudformation:*`
- `s3:*`
- `iam:CreateRole`, `iam:AttachRolePolicy`
- `ssm:PutParameter`

### "Docker not running"

**Solution:** Start Docker Desktop, wait for it to fully start, then re-run.

### "jq not found"

**Solution:** 
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

The scripts will still work without jq but some output formatting won't be as nice.

---

## Script Locations

All scripts are in the repository root:

```
Chatbot_proto/
├── check-bedrock-models.sh      (Model availability checker)
├── deploy-dr.sh                  (Deploy to both regions)
├── setup-route53-dr.sh          (Configure Route 53)
└── deploy-chatbot-with-dr.sh    (Master orchestrator)
```

---

## Summary

**For you (maintaining the app):**
- Run `./deploy-chatbot-with-dr.sh` after code changes
- Deploys to both regions automatically
- No manual steps except Bedrock model access (one-time)

**For other users (first-time deployment):**
- Enable Bedrock models (one-time, 2 minutes)
- Run `./deploy-chatbot-with-dr.sh` (automated, 25 minutes)
- Done!

**Cost:** ~$15/month for full DR (primary + failover + Route 53)

**RTO:** ~2-3 minutes (automatic failover)

---

**Last Updated:** October 13, 2025


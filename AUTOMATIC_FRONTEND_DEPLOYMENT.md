# Automatic Frontend Deployment - Now Integrated!

## ✅ What Changed

The frontend now **automatically deploys** as part of the CDK stack, just like your chatbot project!

### Before:
- ❌ Manual frontend build (`npm run build`)
- ❌ Manual S3 sync (`aws s3 sync`)
- ❌ Manual CloudFront invalidation
- ❌ Manual environment variable configuration

### After:
- ✅ **Automatic build during CDK deployment**
- ✅ **Automatic S3 deployment**
- ✅ **Automatic CloudFront cache invalidation**
- ✅ **Runtime configuration via `config.json`** (no rebuild needed!)

---

## How It Works

### 1. CDK Stack Deployment
When you run `cdk deploy`, the stack now:
1. Builds the React frontend in a Docker container
2. Creates a `config.json` file with all stack outputs
3. Deploys everything to S3
4. Automatically invalidates CloudFront cache

### 2. Runtime Configuration
The frontend loads configuration from `/config.json` at runtime:
- No rebuild needed when stack outputs change
- Falls back to environment variables for local development
- All Cognito/API endpoints automatically configured

---

## Usage

### Deploy Everything (Frontend Included)
```bash
cd intelligent-doc-processor/backend
npm install
cdk deploy SimplifiedDocProcessorStack
```

**That's it!** The frontend will be built and deployed automatically.

### Access Your Application
After deployment, get the CloudFront URL from stack outputs:
```bash
cdk outputs SimplifiedDocProcessorStack
# Look for: CloudFrontURL
```

Open that URL in your browser - the frontend is ready!

---

## Local Development

For local development, the frontend still uses environment variables:

1. Create `frontend/.env`:
```env
REACT_APP_USER_POOL_ID=...
REACT_APP_USER_POOL_CLIENT_ID=...
REACT_APP_COGNITO_DOMAIN=...
REACT_APP_API_ENDPOINT=...
REACT_APP_REGION=us-west-2
REACT_APP_REDIRECT_URL=http://localhost:3000
```

2. Run locally:
```bash
cd frontend
npm install
npm start
```

The app will use environment variables when `config.json` is not available (local dev).

---

## Benefits

✅ **One Command Deployment**: `cdk deploy` does everything
✅ **No Manual Steps**: Build, deploy, and cache invalidation automatic
✅ **Runtime Configuration**: Update stack outputs without rebuilding frontend
✅ **Matches Your Pattern**: Same approach as your chatbot project
✅ **Local Dev Support**: Still works with `.env` files for development

---

## What Gets Deployed

The `BucketDeployment` construct:
- Builds React app (`npm install` + `npm run build`)
- Deploys `build/` contents to S3
- Deploys `config.json` with runtime configuration
- Invalidates CloudFront cache automatically
- Prunes old files from S3 bucket

---

## Configuration in config.json

The deployed `config.json` contains:
```json
{
  "userPoolId": "...",
  "userPoolClientId": "...",
  "cognitoDomain": "...",
  "apiEndpoint": "https://...",
  "region": "us-west-2",
  "cloudfrontUrl": "https://...",
  "redirectUrl": "https://..."
}
```

Frontend components automatically load and use this configuration.


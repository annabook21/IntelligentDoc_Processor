# Frontend Implementation Plan

## Research Summary

After researching AWS best practices, here's the recommended approach for the visualization suite:

### Recommended Solution: S3 + CloudFront + Cognito + React

**Why This Approach:**
1. ✅ **S3 + CloudFront**: Industry-standard for static website hosting
   - Low cost (~$1-5/month for moderate traffic)
   - Global CDN distribution
   - OAC (Origin Access Control) for security
   - No server management

2. ✅ **AWS Cognito**: Better UX than IAM for frontend authentication
   - User-friendly login/signup
   - Token-based authentication
   - Can integrate with API Gateway

3. ✅ **React Frontend**: 
   - Component-based architecture
   - Rich visualization libraries (Chart.js, Recharts, D3.js)
   - Can reuse existing frontend code patterns

### Alternative: AWS Amplify
- ✅ Easier setup (managed service)
- ✅ Built-in CI/CD
- ✅ Automatic CloudFront/CDN setup
- ⚠️ Less control over infrastructure
- ⚠️ Vendor lock-in

**Recommendation**: Start with S3 + CloudFront for full control, migrate to Amplify later if needed.

## Architecture

```
┌─────────────────┐
│   User Browser  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  CloudFront CDN │ (Static website hosting)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   S3 Frontend   │ (React build files)
│     Bucket      │
└─────────────────┘

┌─────────────────┐
│ Cognito User    │ (Authentication)
│     Pool        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  API Gateway    │ (With Cognito authorizer)
└────────┬────────┘
         │
         ├─→ /upload (presigned URL for S3)
         ├─→ /search (query DynamoDB)
         └─→ /metadata/{id} (get document details)
```

## Implementation Plan

### Phase 1: Frontend Infrastructure (CDK)

1. **S3 Bucket for Frontend**
   - Static website hosting
   - Block public access
   - OAC for CloudFront access

2. **CloudFront Distribution**
   - Origin: S3 bucket
   - OAC (Origin Access Control)
   - Default root object: `index.html`
   - SSL certificate (ACM)

3. **Cognito User Pool**
   - User signup/login
   - Password policies
   - MFA (optional)

4. **API Gateway Updates**
   - Add Cognito authorizer
   - Add `/upload` endpoint for presigned URLs

### Phase 2: Frontend Application (React)

1. **Upload Component**
   - Drag-and-drop file upload
   - Generate presigned URL via API
   - Upload directly to S3
   - Progress tracking

2. **Visualization Dashboard**
   - Document list with filters
   - Language distribution chart
   - Entity type breakdown (people, places, orgs)
   - Key phrases word cloud
   - Processing status timeline

3. **Document Viewer**
   - Summary display
   - Insights visualization
   - Structured data table
   - Entity highlighting
   - Metadata details

### Phase 3: Visualization Libraries

**Recommended Libraries:**
- **Recharts** (React charts) - Simple, beautiful charts
- **D3.js** - Advanced custom visualizations
- **Chart.js** - Lightweight, good for basic charts
- **WordCloud** - For key phrases visualization

## Security Considerations

1. **S3 Frontend Bucket**: Private (CloudFront OAC only)
2. **API Gateway**: Cognito authorizer (no public access)
3. **Presigned URLs**: Short-lived (5 minutes) for uploads
4. **Cognito**: User pool with secure password policies

## Cost Estimate

- **S3 Storage**: ~$0.023/GB/month (frontend files ~10MB = $0.0002/month)
- **CloudFront**: ~$0.085/GB transfer (first 10TB)
- **Cognito**: Free tier (50,000 MAU)
- **Total**: ~$1-5/month for moderate usage

## Implementation Steps

1. **Backend Updates**:
   - Add Cognito User Pool to CDK stack
   - Add `/upload` endpoint with presigned URL generation
   - Update API Gateway to support Cognito auth

2. **Frontend Development**:
   - Create React app
   - Integrate Cognito authentication
   - Build upload component
   - Build visualization dashboard
   - Build document viewer

3. **Build & Deploy**:
   - Build React app (`npm run build`)
   - Deploy to S3 bucket
   - Configure CloudFront distribution
   - Test end-to-end

## Next Steps

1. Implement backend infrastructure (CDK)
2. Create React frontend application
3. Integrate authentication
4. Build visualization components
5. Deploy and test


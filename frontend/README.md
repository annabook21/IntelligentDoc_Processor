# Document Processor Frontend

React-based visualization suite for the Intelligent Document Processing pipeline.

## Features

- **Authentication**: AWS Cognito integration for secure access
- **Document Upload**: Drag-and-drop file upload with progress tracking
- **Visualization Dashboard**: 
  - Language distribution charts
  - Entity type breakdown
  - Key phrases word cloud
  - Processing timeline
- **Document Viewer**: Detailed view of processed documents with summaries, insights, and extracted data

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Create a `.env` file with:
```
REACT_APP_USER_POOL_ID=your-user-pool-id
REACT_APP_USER_POOL_CLIENT_ID=your-client-id
REACT_APP_API_ENDPOINT=https://your-api.execute-api.region.amazonaws.com/prod
REACT_APP_REGION=us-west-2
REACT_APP_REDIRECT_URL=http://localhost:3000
```

3. Start development server:
```bash
npm start
```

4. Build for production:
```bash
npm run build
```

The build output in the `build/` directory should be deployed to the S3 bucket configured in the CDK stack.

## Deployment

After building, deploy to S3:

```bash
aws s3 sync build/ s3://<frontend-bucket-name>/
```

Then invalidate CloudFront cache:

```bash
aws cloudfront create-invalidation --distribution-id <distribution-id> --paths "/*"
```

## Architecture

- **React Router**: Client-side routing
- **AWS Amplify**: Authentication with Cognito
- **Recharts**: Data visualization
- **React Wordcloud**: Word cloud visualization
- **Axios**: HTTP client for API calls


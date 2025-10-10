import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const Documentation = () => {
  return (
    <Box sx={{ padding: 3 }}>
      <Paper sx={{ padding: 4, backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
        <Typography variant="h4" sx={{ color: '#FF9900', marginBottom: 3 }}>
          System Architecture
        </Typography>
        
        <Typography variant="body1" sx={{ color: '#AAB7B8', marginBottom: 2 }}>
          This is a minimal documentation tab to test the concept. 
          More content will be added after testing.
        </Typography>

        <Typography variant="h6" sx={{ color: '#01A88D', marginTop: 3, marginBottom: 2 }}>
          Core Services
        </Typography>

        <ul>
          <li>
            <Typography variant="body1" sx={{ color: '#AAB7B8' }}>
              Amazon S3: Stores documents and website files
            </Typography>
          </li>
          <li>
            <Typography variant="body1" sx={{ color: '#AAB7B8' }}>
              CloudFront: Delivers website globally
            </Typography>
          </li>
          <li>
            <Typography variant="body1" sx={{ color: '#AAB7B8' }}>
              API Gateway: Routes requests to Lambda functions
            </Typography>
          </li>
          <li>
            <Typography variant="body1" sx={{ color: '#AAB7B8' }}>
              Lambda: Executes backend logic
            </Typography>
          </li>
          <li>
            <Typography variant="body1" sx={{ color: '#AAB7B8' }}>
              Bedrock: Processes documents and generates answers
            </Typography>
          </li>
        </ul>
      </Paper>
    </Box>
  );
};

export default Documentation;


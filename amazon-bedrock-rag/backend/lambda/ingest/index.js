const {
  BedrockAgentClient,
  StartIngestionJobCommand,
} = require("@aws-sdk/client-bedrock-agent"); 
const client = new BedrockAgentClient({ region: process.env.AWS_REGION });

exports.handler = async (event, context) => {
  console.log('Ingestion triggered by S3 event:', JSON.stringify(event, null, 2));
  
  // Extract S3 bucket and key from event
  const s3Event = event.Records?.[0]?.s3;
  const bucketName = s3Event?.bucket?.name;
  const objectKey = s3Event?.object?.key;
  
  console.log(`Processing file: s3://${bucketName}/${objectKey}`);
  
  const input = {
    knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID, 
    dataSourceId: process.env.DATA_SOURCE_ID, 
    clientToken: context.awsRequestId, 
  };

  try {
    const command = new StartIngestionJobCommand(input);
    const response = await client.send(command);
    
    console.log(`✅ Ingestion job started successfully: ${response.ingestionJob.ingestionJobId}`);
    console.log(`Status: ${response.ingestionJob.status}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Ingestion job started successfully',
        ingestionJobId: response.ingestionJob.ingestionJobId,
        status: response.ingestionJob.status,
        file: objectKey,
      }),
    };
    
  } catch (error) {
    console.error('❌ Error starting ingestion job:', error);
    
    // Handle concurrent ingestion job error gracefully
    if (error.name === 'ConflictException' || error.message?.includes('already in progress')) {
      console.warn('⚠️ Ingestion job already in progress. This file will be processed in the next batch.');
      console.warn('Bedrock only allows one concurrent ingestion job per Knowledge Base.');
      console.warn(`File queued: ${objectKey}`);
      
      // Return success to avoid retry - file will be processed on next ingestion
      return {
        statusCode: 202, // Accepted
        body: JSON.stringify({
          message: 'Ingestion job already running. File will be processed in next batch.',
          file: objectKey,
        }),
      };
    }
    
    // Handle validation errors
    if (error.name === 'ValidationException') {
      console.error('❌ Validation error:', error.message);
      throw new Error(`Validation failed for ${objectKey}: ${error.message}`);
    }
    
    // Handle access denied errors
    if (error.name === 'AccessDeniedException') {
      console.error('❌ Access denied. Check IAM permissions for Knowledge Base role.');
      throw new Error(`Access denied when processing ${objectKey}: ${error.message}`);
    }
    
    // Log error details and re-throw for DLQ
    console.error('Error details:', {
      errorName: error.name,
      errorMessage: error.message,
      file: objectKey,
      knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
      dataSourceId: process.env.DATA_SOURCE_ID,
    });
    
    throw error; // Re-throw to trigger retry and eventual DLQ
  }
};

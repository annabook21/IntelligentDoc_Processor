const {
  BedrockClient,
  ListFoundationModelsCommand,
} = require("@aws-sdk/client-bedrock");

const client = new BedrockClient({ region: process.env.AWS_REGION });

// These are the models the solution requires to be enabled
const REQUIRED_MODELS = [
  "amazon.titan-embed-text-v1",
  "anthropic.claude-3-sonnet-20240229-v1:0",
];

exports.handler = async (event, context) => {
  console.log("Event: ", JSON.stringify(event, null, 2));

  // The CDK's Provider framework will handle the success/failure signaling,
  // we just need to throw an error on failure or return successfully on success.
  // We don't need to handle Update or Delete events for this check.
  if (event.RequestType === 'Delete') {
    return;
  }

  try {
    const command = new ListFoundationModelsCommand({});
    const response = await client.send(command);

    const availableModels = response.modelSummaries.map((model) => model.modelId);
    console.log("Available models: ", availableModels);

    const missingModels = REQUIRED_MODELS.filter(
      (requiredModel) => !availableModels.includes(requiredModel)
    );

    if (missingModels.length > 0) {
      const errorMessage = `
        ERROR: Required Bedrock models are not enabled. Deployment cannot continue.
        Please go to the Amazon Bedrock console and enable model access for the following models:
        ${missingModels.join("\n")}
        
        Navigate to the Model Access page to enable them: 
        https://${process.env.AWS_REGION}.console.aws.amazon.com/bedrock/home?region=${process.env.AWS_REGION}#/modelaccess
      `;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    console.log("✅ Success: All required Bedrock models are enabled.");
    return; // Success
  } catch (error) {
    console.error("Failed to check Bedrock model access:", error);
    // Re-throw the error to fail the CloudFormation deployment
    throw error;
  }
};

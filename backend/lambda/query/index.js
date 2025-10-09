const {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} = require("@aws-sdk/client-bedrock-agent-runtime");
const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const agentClient = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION });
const runtimeClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

import middy from '@middy/core';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpHeaderNormalizer from '@middy/http-header-normalizer';

exports.handler = 
  middy()
  .use(httpJsonBodyParser())
  .use(httpHeaderNormalizer())
  .handler(async (event, context) => {
    const { question, requestSessionId, modelId } = event.body;
    
    try {
      // 1. Retrieve relevant passages from the Knowledge Base
      const retrieveInput = {
        knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
        retrievalQuery: {
          text: question,
        },
      };
      const retrieveCommand = new RetrieveCommand(retrieveInput);
      const retrievalResponse = await agentClient.send(retrieveCommand);
      const retrievedChunks = retrievalResponse.retrievalResults.map(
        (result) => result.content.text
      );

      // 2. Prepare the prompt for the language model
      const formattedContext = retrievedChunks.join("\n\n");
      const prompt = `Based on the following context, please answer the question. If the answer is not in the context, say you don't know.\n\nContext:\n${formattedContext}\n\nQuestion: ${question}`;
      
      const bedrockModelId = modelId || "anthropic.claude-instant-v1";
      
      // 3. Invoke the language model with the Guardrail
      const invokeInput = {
        modelId: bedrockModelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
          max_tokens_to_sample: 1000,
        }),
        guardrailIdentifier: process.env.GUARDRAIL_ID,
        guardrailVersion: process.env.GUARDRAIL_VERSION,
      };

      const invokeCommand = new InvokeModelCommand(invokeInput);
      const invokeResponse = await runtimeClient.send(invokeCommand);
      
      const responseBody = JSON.parse(new TextDecoder().decode(invokeResponse.body));

      // 4. Handle Guardrail interventions on the output
      if (invokeResponse.amazonBedrockGuardrailAction === 'INTERVENED') {
          console.warn('🛡️ Guardrail blocked model output.');
          // The body will contain the custom blocked message from the Guardrail
          return makeResults(200, responseBody.completion, null, null);
      }

      // We don't get citations back in this manual flow, so we return null
      return makeResults(200, responseBody.completion, null, null);
      
    } catch (err) {
      // Check if the error is a Guardrail blocking the user's input
      if (err.name === 'ValidationException' && err.message.includes('Guardrail')) {
        console.warn('🛡️ Guardrail blocked user input:', err.message);
        return makeResults(200, process.env.BLOCKED_INPUT_MESSAGE, null, null);
      }
      
      console.error("Error during RAG process:", err);    
      return makeResults(500, "Server side error: please check function logs", null, null);
    }
});

function makeResults(statusCode,responseText,citationText,responseSessionId){
  return {
		statusCode: statusCode,
		body: JSON.stringify({
      response: responseText,
      citation: citationText,
      sessionId: responseSessionId
		}),
		headers: {
			'Access-Control-Allow-Origin': '*'
		}
	}; 
}
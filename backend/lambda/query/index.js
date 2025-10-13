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

const middy = require('@middy/core').default || require('@middy/core');
const httpJsonBodyParser = require('@middy/http-json-body-parser').default || require('@middy/http-json-body-parser');
const httpHeaderNormalizer = require('@middy/http-header-normalizer').default || require('@middy/http-header-normalizer');

exports.handler = 
  middy()
  .use(httpJsonBodyParser())
  .use(httpHeaderNormalizer())
  .handler(async (event, context) => {
    const { question, requestSessionId } = event.body;
    
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
      
      // Extract ONLY the text chunks - DO NOT extract citation yet (wait for guardrail check)
      const retrievedChunks = retrievalResponse.retrievalResults.map(
        (result) => result.content.text
      );

      // 2. Prepare the prompt for the language model
      const formattedContext = retrievedChunks.join("\n\n");
      const prompt = `You are a helpful assistant that answers questions based ONLY on the provided context. Do not use any outside knowledge.

CRITICAL RULES:
- Use ONLY the information in the context below
- If the context doesn't contain the answer, say "I don't have that information in the provided documents"
- Do NOT make up information or use general knowledge
- Quote directly from the context when possible

Context:
${formattedContext}

Question: ${question}

Answer based ONLY on the context above:`;
      
      const bedrockModelId = "anthropic.claude-3-sonnet-20240229-v1:0"; // Hardcoded to Claude 3 Sonnet
      
      // 3. Invoke the language model with the Guardrail using the Messages API format for Claude 3
      const invokeInput = {
        modelId: bedrockModelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
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
          const blockedMessage = responseBody.content[0].text;
          // Return with NULL citation when guardrail blocks
          return makeResults(200, blockedMessage, null, null);
      }

      // 5. Guardrail passed! NOW extract the citation
      let citation = null;
      if (retrievalResponse.retrievalResults && retrievalResponse.retrievalResults.length > 0) {
        citation = retrievalResponse.retrievalResults[0].location?.s3Location?.uri || null;
      }

      // Extract the response text from the Messages API format
      const responseText = responseBody.content[0].text;

      return makeResults(200, responseText, citation, null);
      
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
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': 'Content-Type',
			'Access-Control-Allow-Methods': 'POST, OPTIONS'
		}
	}; 
}

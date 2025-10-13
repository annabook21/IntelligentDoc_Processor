const {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
} = require("@aws-sdk/client-bedrock-agent-runtime");
const middy = require('@middy/core').default || require('@middy/core');
const httpJsonBodyParser = require('@middy/http-json-body-parser').default || require('@middy/http-json-body-parser');
const httpHeaderNormalizer = require('@middy/http-header-normalizer').default || require('@middy/http-header-normalizer');

const agentClient = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION });

exports.handler = 
  middy()
  .use(httpJsonBodyParser())
  .use(httpHeaderNormalizer())
  .handler(async (event, context) => {
    const { question, requestSessionId } = event.body;
    
    try {
      // Use RetrieveAndGenerate API - does retrieval + generation + guardrails atomically
      // If guardrail blocks, NO citations are returned at all
      const command = new RetrieveAndGenerateCommand({
        input: {
          text: question,
        },
        retrieveAndGenerateConfiguration: {
          type: "KNOWLEDGE_BASE",
          knowledgeBaseConfiguration: {
            knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
            modelArn: `arn:aws:bedrock:${process.env.AWS_REGION}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
            generationConfiguration: {
              promptTemplate: {
                textPromptTemplate: "Based on the following context, please answer the question. If the answer is not in the context, say you don't know.\n\nContext:\n$search_results$\n\nQuestion: $query$"
              },
              guardrailConfiguration: {
                guardrailId: process.env.GUARDRAIL_ID,
                guardrailVersion: process.env.GUARDRAIL_VERSION,
              },
            },
          },
        },
      });

      const response = await agentClient.send(command);

      // Extract citation from the first retrieved reference (if any)
      let citation = null;
      if (response.citations && response.citations.length > 0) {
        const firstCitation = response.citations[0];
        if (firstCitation.retrievedReferences && firstCitation.retrievedReferences.length > 0) {
          citation = firstCitation.retrievedReferences[0].location?.s3Location?.uri || null;
        }
      }

      return makeResults(200, response.output.text, citation, response.sessionId);
      
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
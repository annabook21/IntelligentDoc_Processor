const {
  BedrockAgentClient,
  ListIngestionJobsCommand,
} = require("@aws-sdk/client-bedrock-agent");

const client = new BedrockAgentClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  const input = {
    knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
    dataSourceId: process.env.DATA_SOURCE_ID,
    sortBy: {
      attribute: "STARTED_AT",
      order: "DESCENDING",
    },
    maxResults: 1,
  };

  try {
    const command = new ListIngestionJobsCommand(input);
    const response = await client.send(command);

    const latestJob = response.ingestionJobSummaries?.[0];

    if (!latestJob) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: "NO_JOBS_FOUND" }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: latestJob.status,
        startedAt: latestJob.startedAt,
        updatedAt: latestJob.updatedAt,
      }),
    };
  } catch (error) {
    console.error("Error fetching ingestion status:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to fetch ingestion status" }),
    };
  }
};

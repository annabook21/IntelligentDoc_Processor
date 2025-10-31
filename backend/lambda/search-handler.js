const { DynamoDBClient, QueryCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const dynamodb = new DynamoDBClient();

exports.handler = async (event) => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  const path = event.path || event.requestContext?.path || "";
  const queryParams = event.queryStringParameters || {};
  const documentId = event.pathParameters?.documentId;

  try {
    // Health check endpoint
    if (path.includes("/health")) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          service: "Document Processor API",
        }),
      };
    }

    // Metadata endpoint: GET /metadata/{documentId}
    if (documentId) {
      return await handleMetadata(documentId);
    }

    // Search endpoint: GET /search?q=query&language=en&limit=10
    return await handleSearch(queryParams);
  } catch (error) {
    console.error("Error handling request:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};

async function handleMetadata(documentId) {
  // Query latest metadata for documentId
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: process.env.METADATA_TABLE_NAME,
      KeyConditionExpression: "documentId = :docId",
      ExpressionAttributeValues: {
        ":docId": { S: documentId },
      },
      ScanIndexForward: false, // Get latest first
      Limit: 1,
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return {
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Document not found" }),
    };
  }

  const item = unmarshall(result.Items[0]);
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentId: item.documentId,
      processingDate: item.processingDate,
      language: item.language,
      entities: JSON.parse(item.entities || "[]"),
      keyPhrases: JSON.parse(item.keyPhrases || "[]"),
      text: item.text,
      fullTextLength: parseInt(item.fullTextLength || 0),
    }),
  };
}

async function handleSearch(queryParams) {
  const { language, limit = "10", offset = "0" } = queryParams;
  const limitNum = parseInt(limit);
  const offsetNum = parseInt(offset);

  let items = [];

  if (language) {
    // Query by language using GSI
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: process.env.METADATA_TABLE_NAME,
        IndexName: "LanguageIndex",
        KeyConditionExpression: "language = :lang",
        ExpressionAttributeValues: {
          ":lang": { S: language },
        },
        ScanIndexForward: false,
        Limit: limitNum + offsetNum,
      })
    );

    if (result.Items) {
      items = result.Items
        .slice(offsetNum, offsetNum + limitNum)
        .map((item) => unmarshall(item));
    }
  } else {
    // Scan all documents (for simple search)
    // Note: For production, consider pagination or implementing full-text search
    const result = await dynamodb.send(
      new ScanCommand({
        TableName: process.env.METADATA_TABLE_NAME,
        Limit: limitNum,
      })
    );

    if (result.Items) {
      items = result.Items.map((item) => unmarshall(item));
    }
  }

  // Format results
  const formattedResults = items.map((item) => ({
    documentId: item.documentId,
    processingDate: item.processingDate,
    language: item.language,
    entityCount: JSON.parse(item.entities || "[]").length,
    keyPhraseCount: JSON.parse(item.keyPhrases || "[]").length,
    textPreview: item.text?.substring(0, 200) || "",
  }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      results: formattedResults,
      count: formattedResults.length,
      limit: limitNum,
      offset: offsetNum,
    }),
  };
}


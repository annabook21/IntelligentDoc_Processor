const { DynamoDBClient, QueryCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const dynamodb = new DynamoDBClient();

const getCorsHeaders = () => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
});

exports.handler = async (event) => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  // Handle CORS preflight
  if (event.requestContext?.http?.method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: "",
    };
  }

  const path = event.path || event.requestContext?.path || "";
  const httpMethod = event.requestContext?.http?.method || event.httpMethod || "GET";
  const queryParams = event.queryStringParameters || {};
  const documentId = queryParams.documentId || event.pathParameters?.documentId;

  // Parse POST body if present
  let bodyParams = {};
  if (httpMethod === "POST" && event.body) {
    try {
      bodyParams = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch (e) {
      console.warn("Failed to parse POST body:", e);
    }
  }

  // Merge query params and body params (body takes precedence)
  const params = { ...queryParams, ...bodyParams };

  try {
    // Health check endpoint
    if (path.includes("/health")) {
      return {
        statusCode: 200,
        headers: getCorsHeaders(),
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

    // Search endpoint: GET /search?q=query&language=en&limit=10 or POST /search
    return await handleSearch(params);
  } catch (error) {
    console.error("Error handling request:", error);
    return {
      statusCode: 500,
      headers: getCorsHeaders(),
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
      headers: getCorsHeaders(),
      body: JSON.stringify({ error: "Document not found" }),
    };
  }

  const item = unmarshall(result.Items[0]);
  return {
    statusCode: 200,
    headers: getCorsHeaders(),
    body: JSON.stringify({
      documentId: item.documentId,
      documentName: item.documentName || "Unknown Document", // User-friendly name
      processingDate: item.processingDate,
      language: item.language,
      entities: JSON.parse(item.entities || "[]"),
      keyPhrases: JSON.parse(item.keyPhrases || "[]"),
      text: item.text,
      fullTextLength: parseInt(item.fullTextLength || 0),
      summary: item.summary || "",
      insights: item.insights || "",
      structuredData: JSON.parse(item.structuredData || "{}"),
      status: item.status || "PROCESSED",
      duplicateOf: item.duplicateOf || null,
      contentHash: item.contentHash || null,
    }),
  };
}

async function handleSearch(queryParams) {
  const { language, limit = "100", offset = "0", query = "" } = queryParams;
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

  // Format results - return full document data for frontend
  const documents = items.map((item) => ({
    documentId: item.documentId,
    documentName: item.documentName || "Unknown Document", // User-friendly name
    processingDate: item.processingDate,
    language: item.language,
    entities: item.entities || "[]",
    keyPhrases: item.keyPhrases || "[]",
    text: item.text || "",
    fullTextLength: parseInt(item.fullTextLength || 0),
    summary: item.summary || "",
    insights: item.insights || "",
    structuredData: item.structuredData || "{}",
    status: item.status || "PROCESSED",
    duplicateOf: item.duplicateOf || null,
    contentHash: item.contentHash || null,
  }));

  return {
    statusCode: 200,
    headers: getCorsHeaders(),
    body: JSON.stringify({
      documents: documents,
      count: documents.length,
      limit: limitNum,
      offset: offsetNum,
    }),
  };
}


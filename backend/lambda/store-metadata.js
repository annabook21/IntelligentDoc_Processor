const {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const TABLE_NAME = process.env.METADATA_TABLE_NAME;
const DOCUMENT_NAME_TABLE = process.env.DOCUMENT_NAME_TABLE;

const dynamodb = new DynamoDBClient();

const MAX_LIST_ITEMS = 25;

const normalizeKeyPhrases = (phrases = []) => {
  if (!Array.isArray(phrases)) return [];

  return phrases
    .map((phrase) => {
      if (!phrase) return null;
      if (typeof phrase === "string") {
        return { text: phrase };
      }

      return {
        text: phrase.Text || phrase.text || "",
        score: typeof phrase.Score === "number" ? Number(phrase.Score.toFixed(4)) : undefined,
      };
    })
    .filter((item) => item && item.text)
    .slice(0, MAX_LIST_ITEMS);
};

const normalizeEntities = (entities = []) => {
  if (!Array.isArray(entities)) return [];

  return entities
    .map((entity) => {
      if (!entity) return null;
      return {
        text: entity.Text || entity.text || "",
        type: entity.Type || entity.type || "",
        score: typeof entity.Score === "number" ? Number(entity.Score.toFixed(4)) : undefined,
      };
    })
    .filter((item) => item && item.text)
    .slice(0, MAX_LIST_ITEMS);
};

exports.handler = async (event) => {
  console.log("store-metadata event", JSON.stringify(event));

  if (!TABLE_NAME || !DOCUMENT_NAME_TABLE) {
    throw new Error("METADATA_TABLE_NAME and DOCUMENT_NAME_TABLE environment variables are required");
  }

  const {
    bucket,
    key,
    text,
    language,
    entities,
    keyPhrases,
    summary,
    insights,
    structuredData,
    status,
    duplicateOf,
    contentHash,
  } = event;

  if (!bucket || !key) {
    throw new Error("bucket and key are required");
  }

  // Lookup friendly documentId and document name from the document-name mapping table
  const s3Key = key;
  let documentId = null;
  let documentName = "Unknown Document";
  
  try {
    const queryResult = await dynamodb.send(
      new QueryCommand({
        TableName: DOCUMENT_NAME_TABLE,
        IndexName: "S3KeyIndex",
        KeyConditionExpression: "s3Key = :s3Key",
        ExpressionAttributeValues: {
          ":s3Key": { S: s3Key },
        },
        Limit: 1,
      })
    );
    
    if (queryResult.Items && queryResult.Items.length > 0) {
      const nameMapping = unmarshall(queryResult.Items[0]);
      documentId = nameMapping.documentId;
      documentName = nameMapping.documentName;
      console.log(`Found document mapping: ${documentId} -> ${documentName}`);
    } else {
      console.warn(`No document name mapping found for S3 key: ${s3Key}`);
      // Fallback: use S3 key as documentId (for documents uploaded before this feature)
      documentId = `${bucket}/${key}`;
    }
  } catch (error) {
    console.error(`Error querying document name table: ${error.message}`);
    // Fallback: use S3 key as documentId
    documentId = `${bucket}/${key}`;
  }

  const now = new Date().toISOString();
  const textPreview = (text || "").substring(0, 10000);
  const normalizedEntities = normalizeEntities(entities);
  const normalizedKeyPhrases = normalizeKeyPhrases(keyPhrases);

  const safeSummary = typeof summary === "string" ? summary : JSON.stringify(summary || "");
  const safeInsights = typeof insights === "string" ? insights : JSON.stringify(insights || "");
  const safeStructuredData =
    typeof structuredData === "string" ? structuredData : JSON.stringify(structuredData || {});

  const item = {
    documentId: { S: documentId },
    documentName: { S: documentName }, // User-friendly document name
    processingDate: { S: now },
    language: { S: language || "unknown" },
    entities: { S: JSON.stringify(normalizedEntities) },
    keyPhrases: { S: JSON.stringify(normalizedKeyPhrases) },
    text: { S: textPreview },
    fullTextLength: { N: String(text ? text.length : 0) },
    summary: { S: safeSummary.substring(0, 4000) },
    insights: { S: safeInsights.substring(0, 4000) },
    structuredData: { S: safeStructuredData.substring(0, 4000) },
    status: { S: status || "PROCESSED" },
  };

  if (duplicateOf) {
    item.duplicateOf = { S: duplicateOf };
  }

  if (contentHash) {
    item.contentHash = { S: contentHash };
  }

  const command = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: item,
  });

  await dynamodb.send(command);

  return {
    status: "STORED",
    documentId,
    processingDate: now,
  };
};


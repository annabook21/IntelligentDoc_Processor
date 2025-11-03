const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const crypto = require("crypto");

const s3 = new S3Client();
const dynamodb = new DynamoDBClient();

const HASH_TABLE_NAME = process.env.HASH_TABLE_NAME;

async function streamToSha256(body) {
  if (!body) {
    throw new Error("S3 object body is empty");
  }

  if (typeof body.transformToByteArray === "function") {
    const array = await body.transformToByteArray();
    return crypto.createHash("sha256").update(Buffer.from(array)).digest("hex");
  }

  const hash = crypto.createHash("sha256");

  return await new Promise((resolve, reject) => {
    body.on("data", (chunk) => hash.update(chunk));
    body.on("end", () => resolve(hash.digest("hex")));
    body.on("error", reject);
  });
}

exports.handler = async (event) => {
  console.log("check-duplicate received event", JSON.stringify(event));

  if (!HASH_TABLE_NAME) {
    throw new Error("HASH_TABLE_NAME environment variable is required");
  }

  const { bucket, key } = event;

  if (!bucket || !key) {
    throw new Error("bucket and key are required");
  }

  const documentId = `${bucket}/${key}`;

  const getObjectResponse = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  const hash = await streamToSha256(getObjectResponse.Body);
  const nowIso = new Date().toISOString();

  try {
    await dynamodb.send(
      new PutItemCommand({
        TableName: HASH_TABLE_NAME,
        Item: {
          contentHash: { S: hash },
          firstDocumentId: { S: documentId },
          firstSeen: { S: nowIso },
          occurrences: { N: "1" },
        },
        ConditionExpression: "attribute_not_exists(contentHash)",
      })
    );

    return {
      isDuplicate: false,
      hash,
      documentId,
    };
  } catch (error) {
    if (error.name !== "ConditionalCheckFailedException") {
      console.error("Error writing hash record", error);
      throw error;
    }

    const existing = await dynamodb.send(
      new GetItemCommand({
        TableName: HASH_TABLE_NAME,
        Key: {
          contentHash: { S: hash },
        },
      })
    );

    const originalDocumentId = existing.Item?.firstDocumentId?.S || "unknown";

    try {
      await dynamodb.send(
        new UpdateItemCommand({
          TableName: HASH_TABLE_NAME,
          Key: { contentHash: { S: hash } },
          UpdateExpression:
            "SET occurrences = if_not_exists(occurrences, :start) + :inc, latestDocumentId = :latest, lastSeen = :lastSeen",
          ExpressionAttributeValues: {
            ":inc": { N: "1" },
            ":start": { N: "0" },
            ":latest": { S: documentId },
            ":lastSeen": { S: nowIso },
          },
        })
      );
    } catch (updateError) {
      console.warn("Failed to update duplicate occurrence count", updateError);
    }

    return {
      isDuplicate: true,
      hash,
      originalDocumentId,
      documentId,
      message: `Duplicate detected. Original document: ${originalDocumentId}`,
      insights: `Processing skipped because the content matches ${originalDocumentId}.`,
    };
  }
};



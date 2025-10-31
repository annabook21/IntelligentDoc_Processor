const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const {
  ComprehendClient,
  DetectDominantLanguageCommand,
  DetectEntitiesCommand,
  ExtractKeyPhrasesCommand,
} = require("@aws-sdk/client-comprehend");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const textract = new TextractClient();
const comprehend = new ComprehendClient();
const bedrock = new BedrockRuntimeClient();
const dynamodb = new DynamoDBClient();

const BEDROCK_MODEL_ID = "anthropic.claude-sonnet-4-5-20250929-v1:0";

exports.handler = async (event) => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  try {
    // Parse S3 event from EventBridge
    const bucket = event.detail?.bucket?.name || event.detail?.bucket;
    const key = decodeURIComponent(
      (event.detail?.object?.key || event.detail?.object?.key || "")
        .replace(/\+/g, " ")
    );

    if (!bucket || !key) {
      console.error("Invalid S3 event structure:", event);
      throw new Error("Invalid S3 event structure");
    }

    const documentId = `${bucket}/${key}`;
    console.log(`Processing document: ${documentId}`);

    // Step 1: Extract text using Textract
    console.log("Step 1: Extracting text with Textract...");
    const textractResponse = await textract.send(
      new DetectDocumentTextCommand({
        Document: {
          S3Object: {
            Bucket: bucket,
            Name: key,
          },
        },
      })
    );

    // Combine all text blocks
    const text = textractResponse.Blocks
      .filter((block) => block.BlockType === "LINE" && block.Text)
      .map((block) => block.Text)
      .join("\n");

    if (!text || text.trim().length === 0) {
      console.warn("No text extracted from document");
      // Still store metadata with empty text
      await storeMetadata(documentId, {
        language: "unknown",
        entities: [],
        keyPhrases: [],
        text: "",
      });
      return { statusCode: 200, message: "No text found in document" };
    }

    console.log(`Extracted ${text.length} characters of text`);

    // Step 2: Detect language
    console.log("Step 2: Detecting language...");
    const langResponse = await comprehend.send(
      new DetectDominantLanguageCommand({ Text: text.substring(0, 10000) }) // Comprehend limit
    );
    const language = langResponse.Languages[0]?.LanguageCode || "en";

    console.log(`Detected language: ${language}`);

    // Step 3: Extract entities
    console.log("Step 3: Extracting entities...");
    const entitiesResponse = await comprehend.send(
      new DetectEntitiesCommand({
        Text: text.substring(0, 5000), // Comprehend limit
        LanguageCode: language,
      })
    );

    // Step 4: Extract key phrases
    console.log("Step 4: Extracting key phrases...");
    const phrasesResponse = await comprehend.send(
      new ExtractKeyPhrasesCommand({
        Text: text.substring(0, 5000), // Comprehend limit
        LanguageCode: language,
      })
    );

    // Step 5: Generate insights using Bedrock (Claude Sonnet 4.5)
    console.log("Step 5: Generating insights with Bedrock...");
    let summary = "";
    let insights = "";
    let structuredData = "";

    try {
      const prompt = `You are analyzing a document. Provide:
1. A concise summary (2-3 sentences)
2. Key insights and important information
3. Structured data extraction (dates, amounts, names, locations, organizations)

Document text (first 100k characters):
${text.substring(0, 100000)}

Format your response as JSON:
{
  "summary": "concise summary",
  "insights": "key insights and important information",
  "structuredData": {
    "dates": [],
    "amounts": [],
    "keyNames": [],
    "locations": [],
    "organizations": []
  }
}`;

      const bedrockResponse = await bedrock.send(
        new InvokeModelCommand({
          modelId: BEDROCK_MODEL_ID,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 4000,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        })
      );

      const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
      const content = responseBody.content[0].text;
      
      try {
        // Try to parse as JSON
        const parsedContent = JSON.parse(content);
        summary = parsedContent.summary || "";
        insights = parsedContent.insights || "";
        structuredData = JSON.stringify(parsedContent.structuredData || {});
      } catch (parseError) {
        // If not JSON, use the text as summary
        console.warn("Bedrock response not in expected JSON format, using as summary");
        summary = content.substring(0, 1000);
        insights = content;
      }
    } catch (bedrockError) {
      console.error("Error calling Bedrock:", bedrockError);
      // Continue without Bedrock enrichment
      summary = "Error generating summary";
      insights = "Error generating insights";
    }

    // Step 6: Store metadata in DynamoDB
    console.log("Step 6: Storing metadata...");
    await storeMetadata(documentId, {
      language,
      entities: entitiesResponse.Entities || [],
      keyPhrases: phrasesResponse.KeyPhrases || [],
      text: text.substring(0, 10000), // Store first 10k chars
      fullTextLength: text.length,
      summary: summary,
      insights: insights,
      structuredData: structuredData,
    });

    console.log(`Successfully processed document: ${documentId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        documentId,
        language,
        entityCount: entitiesResponse.Entities?.length || 0,
        keyPhraseCount: phrasesResponse.KeyPhrases?.length || 0,
        textLength: text.length,
        summaryGenerated: summary.length > 0,
        insightsGenerated: insights.length > 0,
      }),
    };
  } catch (error) {
    console.error("Error processing document:", error);
    throw error;
  }
};

async function storeMetadata(documentId, metadata) {
  const processingDate = new Date().toISOString();

  await dynamodb.send(
    new PutItemCommand({
      TableName: process.env.METADATA_TABLE_NAME,
      Item: {
        documentId: { S: documentId },
        processingDate: { S: processingDate },
        language: { S: metadata.language },
        entities: { S: JSON.stringify(metadata.entities) },
        keyPhrases: { S: JSON.stringify(metadata.keyPhrases) },
        text: { S: metadata.text || "" },
        fullTextLength: { N: String(metadata.fullTextLength || 0) },
        summary: { S: metadata.summary || "" },
        insights: { S: metadata.insights || "" },
        structuredData: { S: metadata.structuredData || "{}" },
      },
    })
  );
}


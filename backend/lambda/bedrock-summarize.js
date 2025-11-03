const {
  BedrockRuntimeClient,
  InvokeModelCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const bedrock = new BedrockRuntimeClient();

const DEFAULT_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-sonnet-20240229-v1:0";

exports.handler = async (event) => {
  console.log("bedrock-summarize event", JSON.stringify(event));

  const { text } = event;

  if (!text || typeof text !== "string") {
    throw new Error("text is required for Bedrock summarization");
  }

  const inputText = text.substring(0, 100000);

  const prompt = `You are analyzing a document. Provide a concise JSON response with three keys: summary (2-3 sentences), insights (key takeaways), and structuredData (object with arrays for dates, amounts, keyNames, locations, organizations).

Document text:
${inputText}

Return JSON only.`;

  try {
    const response = await bedrock.send(
      new InvokeModelCommand({
        modelId: DEFAULT_MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 2000,
          temperature: 0.2,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      })
    );

    const parsed = JSON.parse(new TextDecoder().decode(response.body));
    const textContent = parsed.content?.[0]?.text || "";

    let summary = "";
    let insights = "";
    let structuredData = {};

    try {
      const asJson = JSON.parse(textContent);
      summary = asJson.summary || "";
      insights = asJson.insights || "";
      structuredData = asJson.structuredData || {};
    } catch (jsonError) {
      console.warn("Bedrock response not JSON, using raw text", jsonError);
      summary = textContent.substring(0, 1000);
      insights = textContent;
      structuredData = {};
    }

    return {
      summary,
      insights,
      structuredData,
    };
  } catch (error) {
    console.error("Bedrock invocation failed", error);
    return {
      summary: "Bedrock summarization unavailable",
      insights: "Summarization failed: " + (error.message || "unknown error"),
      structuredData: {},
    };
  }
};


const {
  ComprehendClient,
  DetectDominantLanguageCommand,
  DetectEntitiesCommand,
  DetectKeyPhrasesCommand,
} = require("@aws-sdk/client-comprehend");

const comprehend = new ComprehendClient();

exports.handler = async (event) => {
  console.log("comprehend-analyze event", JSON.stringify(event));

  const { text } = event;

  if (!text || typeof text !== "string") {
    throw new Error("text is required for comprehension analysis");
  }

  const trimmed = text.substring(0, 100000);
  const textForLanguage = trimmed.substring(0, 10000);
  const textForEntities = trimmed.substring(0, 5000);

  const languageResponse = await comprehend.send(
    new DetectDominantLanguageCommand({
      Text: textForLanguage,
    })
  );

  const language =
    languageResponse.Languages?.[0]?.LanguageCode?.toLowerCase() || "en";

  const entitiesResponse = await comprehend.send(
    new DetectEntitiesCommand({
      Text: textForEntities,
      LanguageCode: language,
    })
  );

  let keyPhrases = [];
  try {
    const phrasesResponse = await comprehend.send(
      new DetectKeyPhrasesCommand({
        Text: textForEntities,
        LanguageCode: language,
      })
    );
    keyPhrases = phrasesResponse.KeyPhrases || [];
  } catch (error) {
    console.error("DetectKeyPhrases failed", error);
    keyPhrases = [];
  }

  return {
    language,
    entities: entitiesResponse.Entities || [],
    keyPhrases,
  };
};


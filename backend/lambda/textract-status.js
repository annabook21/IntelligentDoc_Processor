const {
  TextractClient,
  GetDocumentTextDetectionCommand,
} = require("@aws-sdk/client-textract");

const textract = new TextractClient();

exports.handler = async (event) => {
  console.log("textract-status received event", JSON.stringify(event));

  const { jobId } = event;

  if (!jobId) {
    throw new Error("jobId is required");
  }

  const command = new GetDocumentTextDetectionCommand({
    JobId: jobId,
    MaxResults: 1000,
  });

  const firstResponse = await textract.send(command);

  const status = firstResponse.JobStatus || "IN_PROGRESS";
  console.log("Textract job status", status);

  if (status === "SUCCEEDED") {
    const blocks = [...(firstResponse.Blocks || [])];
    let nextToken = firstResponse.NextToken;

    while (nextToken) {
      const nextResponse = await textract.send(
        new GetDocumentTextDetectionCommand({
          JobId: jobId,
          NextToken: nextToken,
          MaxResults: 1000,
        })
      );
      blocks.push(...(nextResponse.Blocks || []));
      nextToken = nextResponse.NextToken;
    }

    const text = blocks
      .filter((block) => block.BlockType === "LINE" && block.Text)
      .map((block) => block.Text)
      .join("\n");

    return {
      status,
      text,
      jobId,
    };
  }

  if (status === "FAILED") {
    return {
      status,
      errorMessage: firstResponse.StatusMessage || "Textract job failed",
      jobId,
    };
  }

  return {
    status,
    jobId,
  };
};


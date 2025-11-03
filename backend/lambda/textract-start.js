const {
  TextractClient,
  StartDocumentTextDetectionCommand,
} = require("@aws-sdk/client-textract");

const textract = new TextractClient();

exports.handler = async (event) => {
  console.log("textract-start received event", JSON.stringify(event));

  const { bucket, key } = event;

  if (!bucket || !key) {
    throw new Error("bucket and key are required");
  }

  const command = new StartDocumentTextDetectionCommand({
    DocumentLocation: {
      S3Object: {
        Bucket: bucket,
        Name: key,
      },
    },
  });

  const response = await textract.send(command);

  console.log("Started Textract job", response.JobId);

  return {
    jobId: response.JobId,
    bucket,
    key,
  };
};


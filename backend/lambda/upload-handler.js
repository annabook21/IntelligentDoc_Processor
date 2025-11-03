const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client();

exports.handler = async (event) => {
  console.log("Upload request received:", JSON.stringify(event, null, 2));

  // Get origin from request headers for CORS
  const origin = event.headers?.origin || event.headers?.Origin || "*";
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  };

  try {
    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const { fileName, fileType } = body;

    if (!fileName || !fileType) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "fileName and fileType are required",
        }),
      };
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/msword", // .doc
      "image/png",
      "image/jpeg",
      "image/jpg",
    ];

    if (!allowedTypes.includes(fileType)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: `File type ${fileType} not allowed. Allowed types: PDF, DOCX, DOC, PNG, JPEG, JPG`,
        }),
      };
    }

    // Generate unique key with timestamp
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `uploads/${timestamp}-${sanitizedFileName}`;

    // Create presigned URL for PUT request (expires in 5 minutes)
    // Note: Do NOT include KMS encryption headers in presigned URL
    // S3 will automatically use the bucket's default encryption (KMS)
    // Including KMS headers requires browser to send them, which causes signature mismatch
    // Reference: https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html
    const command = new PutObjectCommand({
      Bucket: process.env.DOCUMENTS_BUCKET,
      Key: key,
      ContentType: fileType,
      // Removed ServerSideEncryption and SSEKMSKeyId - S3 will use bucket's default encryption
      // This allows the presigned URL to work without requiring encryption headers from browser
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        uploadUrl: presignedUrl,
        key: key,
        expiresIn: 300, // seconds
      }),
    };
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    const origin = event.headers?.origin || event.headers?.Origin || "*";
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
    };
  }
};


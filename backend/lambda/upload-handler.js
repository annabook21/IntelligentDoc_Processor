const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { v4: uuidv4 } = require("uuid");

const s3 = new S3Client();
const dynamodb = new DynamoDBClient();

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
    const { files } = body;
    
    // Check if this is a batch upload request
    if (files && Array.isArray(files)) {
      // ========== BATCH UPLOAD MODE ==========
      if (files.length === 0) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "files array cannot be empty" }),
        };
      }

      // Validate all files have required fields
      for (const file of files) {
        if (!file.fileName || !file.fileType || !file.documentName) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ 
              error: "Each file must have fileName, fileType, and documentName",
              invalidFile: file
            }),
          };
        }
      }

      // Process all files in parallel
      const timestamp = Date.now();
      const uploadResults = await Promise.all(
        files.map(async (file, index) => {
          try {
            // Validate file type
            const allowedTypes = [
              "application/pdf",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "application/msword",
              "image/png",
              "image/jpeg",
              "image/jpg",
            ];

            if (!allowedTypes.includes(file.fileType)) {
              return {
                fileName: file.fileName,
                documentName: file.documentName,
                success: false,
                error: `File type ${file.fileType} not allowed`,
              };
            }

            // Validate and sanitize document name
            const sanitizedDocName = file.documentName.trim().substring(0, 100);
            if (!sanitizedDocName) {
              return {
                fileName: file.fileName,
                success: false,
                error: "documentName cannot be empty",
              };
            }

            // Generate friendly documentId (UUID)
            const documentId = uuidv4();
            
            // Generate S3 key with timestamp and index for uniqueness
            const sanitizedFileName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
            const s3Key = `uploads/${timestamp}-${index}-${sanitizedFileName}`;

            // Store document name mapping in DynamoDB
            const now = new Date().toISOString();
            await dynamodb.send(
              new PutItemCommand({
                TableName: process.env.DOCUMENT_NAME_TABLE,
                Item: {
                  documentId: { S: documentId },
                  documentName: { S: sanitizedDocName },
                  s3Key: { S: s3Key },
                  s3Bucket: { S: process.env.DOCUMENTS_BUCKET },
                  originalFileName: { S: file.fileName },
                  uploadDate: { S: now },
                  status: { S: "UPLOADING" },
                },
              })
            );

            console.log(`Created document mapping: ${documentId} -> ${sanitizedDocName} (S3: ${s3Key})`);

            // Create presigned URL (expires in 10 minutes for batch uploads)
            const command = new PutObjectCommand({
              Bucket: process.env.DOCUMENTS_BUCKET,
              Key: s3Key,
              ContentType: file.fileType,
              Metadata: {
                documentId: documentId,
                documentName: sanitizedDocName,
              },
            });

            const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 600 }); // 10 minutes

            return {
              fileName: file.fileName,
              documentName: sanitizedDocName,
              uploadUrl: presignedUrl,
              key: s3Key,
              documentId: documentId,
              success: true,
            };
          } catch (error) {
            console.error(`Error processing ${file.fileName}:`, error);
            return {
              fileName: file.fileName,
              documentName: file.documentName,
              success: false,
              error: error.message,
            };
          }
        })
      );

      const successCount = uploadResults.filter(r => r.success).length;
      const failureCount = uploadResults.length - successCount;

      console.log(`Batch upload: ${successCount} succeeded, ${failureCount} failed`);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          batch: true,
          totalFiles: files.length,
          successCount,
          failureCount,
          results: uploadResults,
        }),
      };
    }

    // ========== SINGLE FILE UPLOAD (Backwards Compatible) ==========
    const { fileName, fileType, documentName } = body;

    if (!fileName || !fileType || !documentName) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "fileName, fileType, and documentName are required",
        }),
      };
    }

    // Validate and sanitize document name
    const sanitizedDocName = documentName.trim().substring(0, 100);
    if (!sanitizedDocName) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "documentName cannot be empty",
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

    // Generate friendly documentId (UUID) - this is what users see
    const documentId = uuidv4();
    
    // Generate S3 key (internal storage path - never exposed to users)
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const s3Key = `uploads/${timestamp}-${sanitizedFileName}`;

    // Store document name mapping in DynamoDB
    // This allows us to map the friendly documentId to the S3 key and display name
    const now = new Date().toISOString();
    await dynamodb.send(
      new PutItemCommand({
        TableName: process.env.DOCUMENT_NAME_TABLE,
        Item: {
          documentId: { S: documentId },
          documentName: { S: sanitizedDocName },
          s3Key: { S: s3Key },
          s3Bucket: { S: process.env.DOCUMENTS_BUCKET },
          originalFileName: { S: fileName },
          uploadDate: { S: now },
          status: { S: "UPLOADING" },
        },
      })
    );

    console.log(`Created document mapping: ${documentId} -> ${sanitizedDocName} (S3: ${s3Key})`);

    // Create presigned URL for PUT request (expires in 5 minutes)
    // Note: Do NOT include KMS encryption headers in presigned URL
    // S3 will automatically use the bucket's default encryption (KMS)
    // Including KMS headers requires browser to send them, which causes signature mismatch
    // Reference: https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html
    const command = new PutObjectCommand({
      Bucket: process.env.DOCUMENTS_BUCKET,
      Key: s3Key,
      ContentType: fileType,
      // Add metadata to track the documentId
      Metadata: {
        documentId: documentId,
        documentName: sanitizedDocName,
      },
      // Removed ServerSideEncryption and SSEKMSKeyId - S3 will use bucket's default encryption
      // This allows the presigned URL to work without requiring encryption headers from browser
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        uploadUrl: presignedUrl,
        key: s3Key,
        documentId: documentId, // Return friendly documentId to frontend
        documentName: sanitizedDocName,
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


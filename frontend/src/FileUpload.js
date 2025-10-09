import React, { useState } from "react";
import {
  Box,
  Button,
  Typography,
  LinearProgress,
  Alert,
  Paper,
  List,
  ListItem,
  ListItemText,
  IconButton,
} from "@mui/material";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PropTypes from "prop-types";

const FileUpload = ({ baseUrl, onUploadComplete }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadStatus, setUploadStatus] = useState({});
  const [error, setError] = useState("");

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    setSelectedFiles([...selectedFiles, ...files]);
    setError("");
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const uploadFile = async (file) => {
    try {
      // Get pre-signed URL from backend
      const response = await fetch(`${baseUrl}upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get upload URL");
      }

      const { uploadUrl, key } = await response.json();

      // Upload file to S3 using pre-signed URL
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      }

      return { success: true, key };
    } catch (err) {
      console.error("Upload error:", err);
      return { success: false, error: err.message };
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError("Please select at least one file");
      return;
    }

    if (!baseUrl) {
      setError("API URL is not configured");
      return;
    }

    setUploading(true);
    setError("");
    const newProgress = {};
    const newStatus = {};

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      newProgress[file.name] = 0;
      setUploadProgress({ ...newProgress });

      const result = await uploadFile(file);

      newProgress[file.name] = 100;
      newStatus[file.name] = result.success
        ? "success"
        : `failed: ${result.error}`;

      setUploadProgress({ ...newProgress });
      setUploadStatus({ ...newStatus });
    }

    setUploading(false);
    
    // Clear selected files after successful upload and trigger polling
    setTimeout(() => {
      // Check if at least one file was successful before triggering
      if (Object.values(newStatus).some(s => s === 'success')) {
        onUploadComplete();
      }
      setSelectedFiles([]);
      setUploadProgress({});
      setUploadStatus({});
    }, 3000);
  };

  return (
    <Box sx={{ width: "100%", mt: 1 }}>
      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 2 }}>
        Upload documents (PDF, TXT, DOCX, MD) to build your knowledge base
      </Typography>

      <Paper
        variant="outlined"
        sx={{
          p: 3,
          mt: 2,
          textAlign: "center",
          backgroundColor: "#f8f9fa",
          border: "2px dashed #d0d7de",
          borderRadius: 2,
          transition: 'all 0.3s ease',
          '&:hover': {
            borderColor: '#FF9900',
            backgroundColor: '#fff8f0',
          },
        }}
      >
        <input
          accept=".pdf,.txt,.docx,.md,.doc"
          style={{ display: "none" }}
          id="file-upload-input"
          multiple
          type="file"
          onChange={handleFileSelect}
          disabled={uploading}
        />
        <label htmlFor="file-upload-input">
          <Button
            variant="contained"
            component="span"
            startIcon={<CloudUploadIcon />}
            disabled={uploading || !baseUrl}
          >
            Select Files
          </Button>
        </label>
      </Paper>

      {selectedFiles.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Selected Files ({selectedFiles.length})
          </Typography>
          <List>
            {selectedFiles.map((file, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  !uploading &&
                  !uploadStatus[file.name] && (
                    <IconButton
                      edge="end"
                      onClick={() => handleRemoveFile(index)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  )
                }
              >
                <ListItemText
                  primary={file.name}
                  secondary={`${(file.size / 1024).toFixed(2)} KB`}
                />
                {uploadProgress[file.name] !== undefined && (
                  <Box sx={{ width: "100%", ml: 2 }}>
                    <LinearProgress
                      variant="determinate"
                      value={uploadProgress[file.name]}
                    />
                  </Box>
                )}
                {uploadStatus[file.name] === "success" && (
                  <CheckCircleIcon color="success" sx={{ ml: 1 }} />
                )}
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {selectedFiles.length > 0 && !uploading && (
        <Button
          variant="contained"
          color="primary"
          onClick={handleUpload}
          fullWidth
          sx={{ mt: 2 }}
          disabled={!baseUrl}
        >
          Upload {selectedFiles.length} File{selectedFiles.length > 1 ? "s" : ""}
        </Button>
      )}

      {uploading && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Uploading files... Please wait.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {Object.values(uploadStatus).some((status) => status === "success") && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Files uploaded successfully! They will be automatically processed and
          added to the knowledge base.
        </Alert>
      )}
    </Box>
  );
};

FileUpload.propTypes = {
  baseUrl: PropTypes.string,
  onUploadComplete: PropTypes.func.isRequired,
};

export default FileUpload;


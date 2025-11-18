import React, { useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';
import ProcessingStatus from './ProcessingStatus';
import { Link } from 'react-router-dom';
import './Upload.css';

function Upload() {
  const [selectedFiles, setSelectedFiles] = useState([]); // Changed to array for batch support
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadStatus, setUploadStatus] = useState({});
  const [message, setMessage] = useState({ type: '', text: '' });
  const [processingDocumentIds, setProcessingDocumentIds] = useState([]); // Track multiple docs
  const [processedDocuments, setProcessedDocuments] = useState([]);
  const [batchStats, setBatchStats] = useState(null);

  // Load API endpoint from config.json at runtime, fallback to env var for local dev
  const [apiEndpoint, setApiEndpoint] = React.useState(process.env.REACT_APP_API_ENDPOINT || '');
  
  React.useEffect(() => {
    fetch('/config.json')
      .then(response => response.json())
      .then(config => setApiEndpoint(config.apiEndpoint))
      .catch(() => {
        // Keep env var if config.json not available (local dev)
      });
  }, []);
  
  const API_ENDPOINT = apiEndpoint;

  const validateFile = (file) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'image/png',
      'image/jpeg',
      'image/jpg',
    ];

    if (!allowedTypes.includes(file.type)) {
      return { valid: false, error: 'Invalid file type. Please upload PDF, DOCX, DOC, PNG, or JPEG files.' };
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return { valid: false, error: 'File size exceeds 10MB limit.' };
    }

    return { valid: true };
  };

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    const validFiles = [];
    const errors = [];

    newFiles.forEach(file => {
      const validation = validateFile(file);
      if (validation.valid) {
        // Auto-populate document name from filename (without extension)
        const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        validFiles.push({
          file,
          documentName: nameWithoutExt,
          id: Date.now() + Math.random(), // Unique ID for tracking
        });
      } else {
        errors.push(`${file.name}: ${validation.error}`);
      }
    });

    if (errors.length > 0) {
      setMessage({
        type: 'error',
        text: errors.join('; '),
      });
    } else {
      setMessage({ type: '', text: '' });
    }

    setSelectedFiles([...selectedFiles, ...validFiles]);
  };

  const handleRemoveFile = (id) => {
    setSelectedFiles(selectedFiles.filter(f => f.id !== id));
  };

  const handleDocumentNameChange = (id, newName) => {
    setSelectedFiles(selectedFiles.map(f => 
      f.id === id ? { ...f, documentName: newName } : f
    ));
  };

  const uploadFileToS3 = async (fileObj, uploadUrl) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(prev => ({
            ...prev,
            [fileObj.id]: Math.round(percentComplete)
          }));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status === 200) {
          resolve({ success: true });
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Network error during upload"));
      });

      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", fileObj.file.type);
      xhr.send(fileObj.file);
    });
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setMessage({ type: 'error', text: 'Please select at least one file to upload.' });
      return;
    }

    // Validate all files have document names
    const missingNames = selectedFiles.filter(f => !f.documentName.trim());
    if (missingNames.length > 0) {
      setMessage({ type: 'error', text: 'Please provide names for all documents.' });
      return;
    }

    setUploading(true);
    setUploadProgress({});
    setUploadStatus({});
    setMessage({ type: '', text: '' });
    setBatchStats(null);

    try {
      const startTime = Date.now();

      // Get authentication token
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('Authentication required. Please sign in.');
      }

      // Step 1: Get presigned URLs for all files in batch
      const filesMetadata = selectedFiles.map(f => ({
        fileName: f.file.name,
        fileType: f.file.type,
        documentName: f.documentName.trim(),
      }));

      const endpoint = API_ENDPOINT.endsWith('/') ? API_ENDPOINT.slice(0, -1) : API_ENDPOINT;
      const response = await axios.post(
        `${endpoint}/upload`,
        { files: filesMetadata }, // Batch mode
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Check if backend supports batch
      if (!response.data.batch) {
        // Fallback to sequential if batch not supported
        await handleSequentialUpload(token, endpoint);
        return;
      }

      // Step 2: Upload all files in parallel to S3
      const uploadPromises = response.data.results.map(async (result) => {
        const fileObj = selectedFiles.find(f => f.file.name === result.fileName);
        
        if (!result.success || !fileObj) {
          setUploadStatus(prev => ({ 
            ...prev, 
            [fileObj?.id || result.fileName]: 'failed: ' + (result.error || 'File not found')
          }));
          return {
            fileName: result.fileName,
            success: false,
            error: result.error || "File not found",
          };
        }

        try {
          setUploadProgress(prev => ({ ...prev, [fileObj.id]: 0 }));
          
          await uploadFileToS3(fileObj, result.uploadUrl);
          
          setUploadProgress(prev => ({ ...prev, [fileObj.id]: 100 }));
          setUploadStatus(prev => ({ ...prev, [fileObj.id]: 'success' }));
          
          return { 
            fileName: fileObj.file.name, 
            documentId: result.documentId,
            documentName: result.documentName,
            success: true 
          };
        } catch (err) {
          console.error(`Failed to upload ${fileObj.file.name}:`, err);
          setUploadStatus(prev => ({ 
            ...prev, 
            [fileObj.id]: `failed: ${err.message}` 
          }));
          return { 
            fileName: fileObj.file.name, 
            success: false, 
            error: err.message 
          };
        }
      });

      // Wait for all uploads to complete
      const results = await Promise.all(uploadPromises);
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(1);
      const successResults = results.filter(r => r.success);
      const failureCount = results.length - successResults.length;

      setBatchStats({
        total: selectedFiles.length,
        success: successResults.length,
        failed: failureCount,
        duration,
      });

      // Track document IDs for processing status
      setProcessingDocumentIds(successResults.map(r => r.documentId));

      setMessage({
        type: successResults.length > 0 ? 'success' : 'error',
        text: `${successResults.length} of ${selectedFiles.length} documents uploaded successfully! Processing started.`,
      });

      // Clear selected files after showing results
      setTimeout(() => {
        setSelectedFiles([]);
        setUploadProgress({});
        setUploadStatus({});
        setBatchStats(null);
      }, 5000);

    } catch (error) {
      console.error('Batch upload error:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Upload failed. Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  // Fallback for sequential uploads (backwards compatibility)
  const handleSequentialUpload = async (token, endpoint) => {
    for (const fileObj of selectedFiles) {
      try {
        setUploadProgress(prev => ({ ...prev, [fileObj.id]: 0 }));

        const response = await axios.post(
          `${endpoint}/upload`,
          {
            fileName: fileObj.file.name,
            fileType: fileObj.file.type,
            documentName: fileObj.documentName.trim(),
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const { uploadUrl } = response.data;
        await uploadFileToS3(fileObj, uploadUrl);

        setUploadProgress(prev => ({ ...prev, [fileObj.id]: 100 }));
        setUploadStatus(prev => ({ ...prev, [fileObj.id]: 'success' }));
      } catch (err) {
        setUploadStatus(prev => ({ 
          ...prev, 
          [fileObj.id]: `failed: ${err.message}` 
        }));
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    const event = { target: { files } };
    handleFileChange(event);
  };

  const handleProcessingComplete = (document) => {
    setProcessedDocuments(prev => {
      // Prevent duplicates - only add if not already in the array
      const exists = prev.some(doc => doc.documentId === document.documentId);
      if (exists) {
        return prev;
      }
      return [...prev, document];
    });
  };

  const handleUploadAnother = () => {
    setProcessingDocumentIds([]);
    setProcessedDocuments([]);
    setMessage({ type: '', text: '' });
  };

  const isBatchMode = selectedFiles.length > 1;

  return (
    <div className="upload-container">
      <div className="page-header">
        <h1>Upload Documents</h1>
        <p>Upload documents for processing. Supported formats: PDF, DOCX, DOC, PNG, JPEG (max 10MB per file)</p>
        {isBatchMode && (
          <div className="batch-indicator">
            📦 <strong>Batch Upload Mode:</strong> {selectedFiles.length} files selected
          </div>
        )}
      </div>

      {message.text && (
        <div className={message.type === 'error' ? 'error' : 'success'}>
          {message.text}
        </div>
      )}

      <div className="card">
        <div
          className={`upload-area ${selectedFiles.length > 0 ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            type="file"
            id="file-input"
            onChange={handleFileChange}
            accept=".pdf,.docx,.doc,.png,.jpeg,.jpg"
            multiple
            style={{ display: 'none' }}
          />
          <label htmlFor="file-input" className="upload-label">
            {selectedFiles.length > 0 ? (
              <div>
                <div className="file-icon">📁</div>
                <div className="file-name">{selectedFiles.length} file(s) selected</div>
                <div className="file-size">
                  {(selectedFiles.reduce((sum, f) => sum + f.file.size, 0) / 1024 / 1024).toFixed(2)} MB total
                </div>
              </div>
            ) : (
              <div>
                <div className="upload-icon">📤</div>
                <div className="upload-text">
                  Click to select files or drag and drop multiple files here
                </div>
              </div>
            )}
          </label>
        </div>

        {selectedFiles.length > 0 && (
          <div className="files-list">
            <h3>Selected Files ({selectedFiles.length})</h3>
            {selectedFiles.map((fileObj) => (
              <div key={fileObj.id} className={`file-item ${uploadStatus[fileObj.id] === 'success' ? 'success' : uploadStatus[fileObj.id]?.includes('failed') ? 'error' : ''}`}>
                <div className="file-details">
                  <div className="file-header">
                    <span className="file-icon-small">📄</span>
                    <span className="file-name-small">{fileObj.file.name}</span>
                    <span className="file-size-small">
                      ({(fileObj.file.size / 1024).toFixed(1)} KB)
                    </span>
                    {!uploading && !uploadStatus[fileObj.id] && (
                      <button 
                        className="remove-button" 
                        onClick={() => handleRemoveFile(fileObj.id)}
                        title="Remove file"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    className="document-name-inline"
                    value={fileObj.documentName}
                    onChange={(e) => handleDocumentNameChange(fileObj.id, e.target.value)}
                    placeholder="Enter document name"
                    maxLength={100}
                    disabled={uploading}
                  />
                </div>
                {uploadProgress[fileObj.id] !== undefined && (
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${uploadProgress[fileObj.id]}%` }}
                    ></div>
                    <span className="progress-text">{uploadProgress[fileObj.id]}%</span>
                  </div>
                )}
                {uploadStatus[fileObj.id] === 'success' && (
                  <span className="status-icon success-icon">✓ Uploaded</span>
                )}
                {uploadStatus[fileObj.id]?.includes('failed') && (
                  <span className="status-icon error-icon">✗ {uploadStatus[fileObj.id]}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {batchStats && (
          <div className="batch-stats">
            <h3>✅ Batch Upload Complete</h3>
            <div className="stats-grid">
              <div className="stat">
                <span className="stat-label">Total</span>
                <span className="stat-value">{batchStats.total}</span>
              </div>
              <div className="stat success">
                <span className="stat-label">Success</span>
                <span className="stat-value">{batchStats.success}</span>
              </div>
              <div className="stat error">
                <span className="stat-label">Failed</span>
                <span className="stat-value">{batchStats.failed}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Duration</span>
                <span className="stat-value">{batchStats.duration}s</span>
              </div>
            </div>
          </div>
        )}

        <button
          className="button upload-button"
          onClick={handleUpload}
          disabled={selectedFiles.length === 0 || selectedFiles.some(f => !f.documentName.trim()) || uploading}
        >
          {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} Document${selectedFiles.length > 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Show processing status for uploaded documents */}
      {processingDocumentIds.length > 0 && processedDocuments.length < processingDocumentIds.length && (
        <div className="processing-section">
          <h2>Processing Documents ({processedDocuments.length}/{processingDocumentIds.length} complete)</h2>
          {processingDocumentIds.map(docId => (
            <ProcessingStatus
              key={docId}
              documentId={docId}
              onComplete={handleProcessingComplete}
            />
          ))}
        </div>
      )}

      {/* Show success state with actions */}
      {processedDocuments.length > 0 && (
        <div className="card">
          <h2>✅ {processedDocuments.length} Document{processedDocuments.length > 1 ? 's' : ''} Processed Successfully!</h2>
          <ul>
            {processedDocuments.map(doc => (
              <li key={doc.documentId}>
                <strong>{doc.documentName}</strong> is now available
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <Link to="/dashboard" className="button">
              Go to Dashboard
            </Link>
            <button onClick={handleUploadAnother} className="button button-secondary">
              Upload More Documents
            </button>
          </div>
        </div>
      )}

      {/* Processing information - only show if not processing */}
      {processingDocumentIds.length === 0 && (
        <div className="card">
          <h2>Processing Information</h2>
          <ul className="info-list">
            <li><strong>Batch Upload:</strong> Upload multiple documents at once for faster processing</li>
            <li><strong>Automatic Processing:</strong> Documents are automatically processed upon upload</li>
            <li><strong>Text Extraction:</strong> Amazon Textract handles multi-page PDFs</li>
            <li><strong>Language Detection:</strong> Amazon Comprehend detects language and entities</li>
            <li><strong>AI Summaries:</strong> Claude 3 Sonnet generates intelligent summaries</li>
            <li><strong>Processing Time:</strong> Typically 3-5 minutes per document</li>
            <li><strong>Parallel Processing:</strong> Multiple documents process simultaneously</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default Upload;

import React, { useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';
import ProcessingStatus from './ProcessingStatus';
import { Link } from 'react-router-dom';
import './Upload.css';

function Upload() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentName, setDocumentName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [processingDocumentId, setProcessingDocumentId] = useState(null);
  const [processedDocument, setProcessedDocument] = useState(null);

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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'image/png',
        'image/jpeg',
        'image/jpg',
      ];

      if (!allowedTypes.includes(file.type)) {
        setMessage({
          type: 'error',
          text: 'Invalid file type. Please upload PDF, DOCX, DOC, PNG, or JPEG files.',
        });
        setSelectedFile(null);
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setMessage({
          type: 'error',
          text: 'File size exceeds 10MB limit.',
        });
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      setMessage({ type: '', text: '' });
      // Auto-populate document name from filename (without extension)
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      setDocumentName(nameWithoutExt);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Please select a file to upload.' });
      return;
    }

    if (!documentName.trim()) {
      setMessage({ type: 'error', text: 'Please provide a document name.' });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setMessage({ type: '', text: '' });

    try {
      // Get authentication token
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('Authentication required. Please sign in.');
      }

      // Request presigned URL
      // Ensure no double slashes - remove trailing slash from endpoint if present
      const endpoint = API_ENDPOINT.endsWith('/') ? API_ENDPOINT.slice(0, -1) : API_ENDPOINT;
      const response = await axios.post(
        `${endpoint}/upload`,
        {
          fileName: selectedFile.name,
          fileType: selectedFile.type,
          documentName: documentName.trim(), // User-provided friendly name
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const { uploadUrl, key, documentId } = response.data;

      // Upload file to S3 using presigned URL
      await axios.put(uploadUrl, selectedFile, {
        headers: {
          'Content-Type': selectedFile.type,
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      setMessage({
        type: 'success',
        text: `Document "${documentName}" uploaded successfully! Processing started.`,
      });
      
      // Start tracking processing status
      setProcessingDocumentId(documentId);
      
      setSelectedFile(null);
      setDocumentName('');
      setUploadProgress(0);
    } catch (error) {
      console.error('Upload error:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || error.message || 'Upload failed. Please try again.',
      });
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) {
      const event = { target: { files: [file] } };
      handleFileChange(event);
    }
  };

  const handleProcessingComplete = (document) => {
    setProcessedDocument(document);
    setMessage({
      type: 'success',
      text: `Document "${document.documentName}" processed successfully!`,
    });
  };

  const handleUploadAnother = () => {
    setProcessingDocumentId(null);
    setProcessedDocument(null);
    setMessage({ type: '', text: '' });
  };

  return (
    <div className="upload-container">
      <div className="page-header">
        <h1>Upload Document</h1>
        <p>Upload documents for processing. Supported formats: PDF, DOCX, DOC, PNG, JPEG (max 10MB)</p>
      </div>

      {message.text && (
        <div className={message.type === 'error' ? 'error' : 'success'}>
          {message.text}
        </div>
      )}

      <div className="card">
        <div
          className={`upload-area ${selectedFile ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            type="file"
            id="file-input"
            onChange={handleFileChange}
            accept=".pdf,.docx,.doc,.png,.jpeg,.jpg"
            style={{ display: 'none' }}
          />
          <label htmlFor="file-input" className="upload-label">
            {selectedFile ? (
              <div>
                <div className="file-icon">📄</div>
                <div className="file-name">{selectedFile.name}</div>
                <div className="file-size">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            ) : (
              <div>
                <div className="upload-icon">📤</div>
                <div className="upload-text">
                  Click to select or drag and drop a file here
                </div>
              </div>
            )}
          </label>
        </div>

        {selectedFile && (
          <div className="document-name-input">
            <label htmlFor="document-name">Document Name *</label>
            <input
              type="text"
              id="document-name"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="Enter a friendly name for this document"
              maxLength={100}
              disabled={uploading}
            />
            <small>This name will be displayed in the dashboard (max 100 characters)</small>
          </div>
        )}

        {uploadProgress > 0 && (
          <div className="progress-bar-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <div className="progress-text">{uploadProgress}%</div>
          </div>
        )}

        <button
          className="button upload-button"
          onClick={handleUpload}
          disabled={!selectedFile || !documentName.trim() || uploading}
        >
          {uploading ? 'Uploading...' : 'Upload Document'}
        </button>
      </div>

      {/* Show processing status if document is being processed */}
      {processingDocumentId && !processedDocument && (
        <ProcessingStatus
          documentId={processingDocumentId}
          onComplete={handleProcessingComplete}
        />
      )}

      {/* Show success state with actions */}
      {processedDocument && (
        <div className="card">
          <h2>✅ Document Processed Successfully!</h2>
          <p><strong>{processedDocument.documentName}</strong> is now available in your dashboard.</p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <Link to={`/document/${encodeURIComponent(processedDocument.documentId)}`} className="button">
              View Document Details
            </Link>
            <Link to="/dashboard" className="button">
              Go to Dashboard
            </Link>
            <button onClick={handleUploadAnother} className="button button-secondary">
              Upload Another Document
            </button>
          </div>
        </div>
      )}

      {/* Processing information - only show if not processing */}
      {!processingDocumentId && (
        <div className="card">
          <h2>Processing Information</h2>
          <ul className="info-list">
            <li>Documents are automatically processed upon upload</li>
            <li>Text extraction using Amazon Textract (handles multi-page PDFs)</li>
            <li>Language detection and entity recognition via Amazon Comprehend</li>
            <li>AI-powered summaries generated by Claude Sonnet 4.5</li>
            <li>Processing typically takes 3-5 minutes per document</li>
            <li>You'll see real-time progress updates during processing</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default Upload;


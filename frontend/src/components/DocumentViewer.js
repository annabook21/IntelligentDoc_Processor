import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';
import './DocumentViewer.css';

function DocumentViewer() {
  const { documentId } = useParams();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    if (apiEndpoint) {
      loadDocument();
    }
  }, [documentId, apiEndpoint]);

  const loadDocument = async () => {
    if (!apiEndpoint) {
      return; // Wait for API endpoint to be loaded
    }

    try {
      setLoading(true);
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      // Decode the documentId from the URL parameter
      const decodedDocumentId = decodeURIComponent(documentId);
      
      // Ensure no double slashes in URL
      const endpoint = API_ENDPOINT.endsWith('/') ? API_ENDPOINT.slice(0, -1) : API_ENDPOINT;

      // Use query parameter to support documentId with slashes
      const response = await axios.get(`${endpoint}/metadata?documentId=${encodeURIComponent(decodedDocumentId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setDocument(response.data);
      setError(null);
    } catch (err) {
      console.error('Error loading document:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading document details...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!document) {
    return <div className="error">Document not found</div>;
  }

  const entities = typeof document.entities === 'string' 
    ? JSON.parse(document.entities || '[]') 
    : document.entities || [];
  
  // DEBUG: Log entity structure
  console.log('DocumentViewer entities (first 3):', entities.slice(0, 3));
  console.log('First entity keys:', entities[0] ? Object.keys(entities[0]) : 'no entities');
  
  const keyPhrases = typeof document.keyPhrases === 'string'
    ? JSON.parse(document.keyPhrases || '[]')
    : document.keyPhrases || [];

  const structuredData = typeof document.structuredData === 'string'
    ? JSON.parse(document.structuredData || '{}')
    : document.structuredData || {};

  return (
    <div className="document-viewer-container">
      <div className="page-header">
        <h1>{document.documentName || 'Document Details'}</h1>
        <p className="document-subtitle">Document Insights and Analysis</p>
      </div>

      {/* Summary Section */}
      <div className="card">
        <h2>Summary</h2>
        <p className="summary-text">{document.summary || 'No summary available'}</p>
      </div>

      {/* Insights Section */}
      <div className="card">
        <h2>Key Insights</h2>
        <p className="insights-text">{document.insights || 'No insights available'}</p>
      </div>

      {/* Metadata Grid */}
      <div className="metadata-grid">
        <div className="card">
          <h3>Language</h3>
          <p className="metadata-value">{document.language || 'Unknown'}</p>
        </div>
        <div className="card">
          <h3>Processing Date</h3>
          <p className="metadata-value">
            {document.processingDate 
              ? new Date(document.processingDate).toLocaleString()
              : 'N/A'}
          </p>
        </div>
        <div className="card">
          <h3>Text Length</h3>
          <p className="metadata-value">
            {document.fullTextLength ? `${document.fullTextLength.toLocaleString()} characters` : 'N/A'}
          </p>
        </div>
      </div>

      {/* Entities Section */}
      {entities.length > 0 && (
        <div className="card">
          <h2>Extracted Entities ({entities.length})</h2>
          <div className="entities-list">
            {entities.map((entity, index) => (
              <div key={index} className="entity-item">
                <span className="entity-type">{entity.type || entity.Type || 'UNKNOWN'}</span>
                <span className="entity-text">{entity.text || entity.Text || 'N/A'}</span>
                {(entity.score || entity.Score) && (
                  <span className="entity-score">{((entity.score || entity.Score) * 100).toFixed(1)}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Phrases Section */}
      {keyPhrases.length > 0 && (
        <div className="card">
          <h2>Key Phrases ({keyPhrases.length})</h2>
          <div className="phrases-list">
            {keyPhrases.map((phrase, index) => (
              <span key={index} className="phrase-tag">
                {phrase.Text || phrase.text || phrase}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Structured Data Section */}
      {Object.keys(structuredData).length > 0 && (
        <div className="card">
          <h2>Structured Data</h2>
          <div className="structured-data">
            {Object.entries(structuredData).map(([key, value]) => (
              <div key={key} className="structured-item">
                <h4>{key.charAt(0).toUpperCase() + key.slice(1)}</h4>
                {Array.isArray(value) && value.length > 0 ? (
                  <ul>
                    {value.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No {key} found</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Text Preview Section */}
      {document.text && (
        <div className="card">
          <h2>Text Preview</h2>
          <div className="text-preview">
            {document.text.substring(0, 5000)}
            {document.text.length > 5000 && '...'}
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentViewer;


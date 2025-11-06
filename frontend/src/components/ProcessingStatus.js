import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import './ProcessingStatus.css';

function ProcessingStatus({ documentId, onComplete }) {
  const [status, setStatus] = useState('PROCESSING');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [error, setError] = useState(null);

  // Load API endpoint from config.json
  const [apiEndpoint, setApiEndpoint] = useState(process.env.REACT_APP_API_ENDPOINT || '');
  
  useEffect(() => {
    fetch('/config.json')
      .then(response => response.json())
      .then(config => setApiEndpoint(config.apiEndpoint))
      .catch(() => {
        // Keep env var if config.json not available (local dev)
      });
  }, []);

  useEffect(() => {
    if (!apiEndpoint || !documentId) return;

    let timerId;
    let pollInterval;

    const pollStatus = async () => {
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        if (!token) {
          setError('Authentication required');
          return;
        }

        const endpoint = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
        const response = await axios.get(
          `${endpoint}/metadata?documentId=${encodeURIComponent(documentId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            validateStatus: (status) => status < 500, // Don't throw on 404
          }
        );
        
        // Check if response is 404 (document not processed yet)
        if (response.status === 404) {
          // Keep polling - document is still being processed
          return;
        }

        const doc = response.data;
        
        if (doc.status === 'PROCESSED' || doc.status === 'DUPLICATE') {
          setStatus(doc.status);
          clearInterval(pollInterval);
          clearInterval(timerId);
          if (onComplete) {
            onComplete(doc);
          }
        } else if (doc.status === 'FAILED') {
          setStatus('FAILED');
          setError('Document processing failed');
          clearInterval(pollInterval);
          clearInterval(timerId);
        }
      } catch (err) {
        console.error('Error checking document status:', err);
        setError('Failed to check document status');
      }
    };

    // Update elapsed time every second
    timerId = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    // Poll for status every 5 seconds
    pollInterval = setInterval(pollStatus, 5000);
    
    // Initial poll
    pollStatus();

    return () => {
      clearInterval(timerId);
      clearInterval(pollInterval);
    };
  }, [documentId, apiEndpoint, onComplete]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (status === 'PROCESSED') {
    return (
      <div className="processing-status success">
        <div className="status-icon">✅</div>
        <div className="status-content">
          <h3>Processing Complete!</h3>
          <p>Your document has been successfully processed in {formatTime(elapsedTime)}</p>
        </div>
      </div>
    );
  }

  if (status === 'DUPLICATE') {
    return (
      <div className="processing-status warning">
        <div className="status-icon">⚠️</div>
        <div className="status-content">
          <h3>Duplicate Detected</h3>
          <p>This document has already been processed</p>
        </div>
      </div>
    );
  }

  if (status === 'FAILED') {
    return (
      <div className="processing-status error">
        <div className="status-icon">❌</div>
        <div className="status-content">
          <h3>Processing Failed</h3>
          <p>{error || 'An error occurred during processing'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="processing-status processing">
      <div className="status-icon">
        <div className="spinner"></div>
      </div>
      <div className="status-content">
        <h3>Processing Document...</h3>
        <p>Elapsed time: {formatTime(elapsedTime)}</p>
        <div className="processing-steps">
          <div className="step active">
            <div className="step-number">1</div>
            <div className="step-label">Text Extraction</div>
          </div>
          <div className="step active">
            <div className="step-number">2</div>
            <div className="step-label">Language Detection</div>
          </div>
          <div className="step active">
            <div className="step-number">3</div>
            <div className="step-label">Entity Recognition</div>
          </div>
          <div className="step active">
            <div className="step-number">4</div>
            <div className="step-label">AI Summarization</div>
          </div>
        </div>
        <small className="estimated-time">
          ⏱️ Estimated time: 3-5 minutes for standard documents
        </small>
      </div>
    </div>
  );
}

export default ProcessingStatus;


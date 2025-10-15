import React, { useState, useEffect } from 'react';
import './AnimatedSequence.css';

const AnimatedSequence = ({ flowType }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedStep, setSelectedStep] = useState(null);

  const queryFlow = [
    {
      id: 1,
      icon: '👤',
      title: 'User Asks Question',
      description: 'User types: "What is our refund policy?"',
      details: 'CloudFront serves the app from S3 (W2) and fails over to S3 (E1) on 5xx. API calls target the primary API Gateway.',
      technical: 'POST https://api.example.com/docs { "question": "What is our refund policy?" }',
      time: '0ms'
    },
    {
      id: 2,
      icon: '🔌',
      title: 'API Gateway Validates (Primary: us-west-2)',
      description: 'Checks request format, applies throttling, logs to CloudWatch',
      details: 'Validates JSON schema, checks API key (if configured), applies rate limiting. Identical API Gateway exists in us-east-1 for failover.',
      technical: 'Rate limit: 100 requests/second per IP, 200 burst capacity',
      time: '5ms'
    },
    {
      id: 3,
      icon: '⚡',
      title: 'Query Lambda Invoked',
      description: 'Lambda receives question and session ID',
      details: 'Lambda spins up (cold start: 1-2s, warm: <100ms) and begins orchestration',
      technical: 'Runtime: Node.js 18.x, Memory: 512MB, Timeout: 29s',
      time: '10ms'
    },
    {
      id: 4,
      icon: '🛡️',
      title: 'Guardrails Check Input',
      description: 'Scans question for harmful content',
      details: 'Checks for hate speech, violence, sexual content, insults. Blocks if threshold exceeded.',
      technical: 'Bedrock Guardrails API with HIGH sensitivity across all categories',
      time: '50ms'
    },
    {
      id: 5,
      icon: '🧠',
      title: 'Retrieve Context',
      description: 'Knowledge Base searches for relevant document chunks',
      details: 'Converts question to 1536-dim vector, searches OpenSearch using k-NN',
      technical: 'Returns top-5 chunks with similarity scores > 0.7',
      time: '150ms'
    },
    {
      id: 6,
      icon: '🔍',
      title: 'OpenSearch Vector Search',
      description: 'Finds 5 most similar document chunks',
      details: 'Uses HNSW algorithm for approximate nearest neighbor search',
      technical: 'Cosine similarity: 0.89 (chunk 1), 0.85 (chunk 2), 0.82 (chunk 3)...',
      time: '50ms'
    },
    {
      id: 7,
      icon: '📝',
      title: 'Build Augmented Prompt',
      description: 'Lambda combines context + question',
      details: 'Formats context chunks with citations, adds system prompt: "Use ONLY this context"',
      technical: 'Total tokens: ~3,500 (context: 2,500, question: 15, system: 985)',
      time: '10ms'
    },
    {
      id: 8,
      icon: '🤖',
      title: 'Claude Generates Answer',
      description: 'Claude reads context and writes natural language response',
      details: 'Generates tokens one-by-one (autoregressive), stops at complete sentence',
      technical: 'Model: anthropic.claude-3-sonnet-20240229-v1:0, Temperature: 0.7',
      time: '2000ms'
    },
    {
      id: 9,
      icon: '🛡️',
      title: 'Guardrails Check Output',
      description: 'Verifies answer is safe before returning',
      details: 'Scans generated answer for policy violations, blocks if threshold exceeded',
      technical: 'Same guardrails config as input filtering',
      time: '50ms'
    },
    {
      id: 10,
      icon: '✅',
      title: 'Return to User',
      description: 'Answer + citations displayed in chat',
      details: 'Lambda formats response with markdown, includes source document names. Frontend stays on the same CloudFront URL. Backend API failover is manual (update config.json) or client-side if implemented.',
      technical: 'Total round-trip: ~2.3 seconds (primary). If primary API fails, switch config.json to the failover API URL (or implement client-side retry).',
      time: '10ms'
    }
  ];

  const uploadFlow = [
    {
      id: 1,
      icon: '👤',
      title: 'User Selects File',
      description: 'User clicks "Upload" and selects document.pdf',
      details: 'Frontend validates file type (PDF, DOCX, TXT, MD) and size (< 10MB)',
      technical: 'File: document.pdf, Size: 2.4MB, Type: application/pdf',
      time: '0ms'
    },
    {
      id: 2,
      icon: '🔌',
      title: 'Request Pre-Signed URL',
      description: 'Frontend asks for secure upload URL',
      details: 'Calls API Gateway POST /upload with filename',
      technical: 'POST /upload { "filename": "document.pdf" }',
      time: '5ms'
    },
    {
      id: 3,
      icon: '⚡',
      title: 'Upload Lambda Generates URL',
      description: 'Creates temporary URL for direct S3 upload',
      details: 'Generates unique S3 key with timestamp, creates pre-signed URL valid for 5 minutes',
      technical: 's3://docs-bucket/uploads/1699999999-document.pdf?X-Amz-Signature=...',
      time: '50ms'
    },
    {
      id: 4,
      icon: '📤',
      title: 'Direct Upload to S3',
      description: 'Frontend uploads file directly to S3 (bypasses Lambda)',
      details: 'Uses pre-signed URL to PUT file directly to S3, shows progress bar',
      technical: 'PUT with 2.4MB payload, server-side encryption enabled',
      time: '3000ms'
    },
    {
      id: 5,
      icon: '💾',
      title: 'S3 Stores File',
      description: 'Document saved in S3 Documents bucket',
      details: 'S3 writes file, enables versioning, encrypts at rest with AES-256',
      technical: 'Object key: uploads/1699999999-document.pdf, ETag: "abc123..."',
      time: '100ms'
    },
    {
      id: 6,
      icon: '🔔',
      title: 'S3 Event Triggers Lambda',
      description: 'ObjectCreated:Put event sent to Ingestion Lambda',
      details: 'S3 Event Notification with bucket name and object key',
      technical: 'Event: s3:ObjectCreated:Put, Time: 2024-10-10T12:00:00Z',
      time: '500ms'
    },
    {
      id: 7,
      icon: '⚡',
      title: 'Ingestion Lambda Starts Job',
      description: 'Calls Bedrock StartIngestionJob API',
      details: 'Tells Bedrock Knowledge Base to process the new document',
      technical: 'bedrock.startIngestionJob({ dataSourceId, knowledgeBaseId })',
      time: '200ms'
    },
    {
      id: 8,
      icon: '🧠',
      title: 'Bedrock Processes Document',
      description: 'Extracts text, chunks, generates embeddings',
      details: 'OCR/text extraction → split into 500-token chunks → embed each chunk',
      technical: '10-page PDF = ~40 chunks × 1536 dimensions = 61,440 numbers',
      time: '60000ms'
    },
    {
      id: 9,
      icon: '🔍',
      title: 'Store in OpenSearch',
      description: 'All vectors indexed in vector database',
      details: 'Creates OpenSearch document for each chunk with vector + metadata',
      technical: 'Index: kb-docs, 40 documents added, refresh interval: 1s',
      time: '5000ms'
    },
    {
      id: 10,
      icon: '✅',
      title: 'Ingestion Complete + Replication',
      description: 'Document ready for querying in primary region!',
      details: 'Status changes from IN_PROGRESS → COMPLETE, frontend polls and shows success. S3 Cross-Region Replication automatically copies to us-east-1 failover region within 15 minutes.',
      technical: 'Total ingestion time: ~65 seconds for 10-page PDF. Failover region gets replicated copy for DR.',
      time: '0ms'
    }
  ];

  const steps = flowType === 'query' ? queryFlow : uploadFlow;

  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, steps.length]);

  const handlePlay = () => {
    setCurrentStep(0);
    setIsPlaying(true);
    setSelectedStep(null);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleReset = () => {
    setCurrentStep(0);
    setIsPlaying(false);
    setSelectedStep(null);
  };

  const handleStepClick = (index) => {
    setIsPlaying(false);
    setSelectedStep(selectedStep === index ? null : index);
    setCurrentStep(index);
  };

  return (
    <div className="animated-sequence">
      {/* Controls */}
      <div className="sequence-controls">
        <button 
          className="control-btn play-btn"
          onClick={isPlaying ? handlePause : handlePlay}
          disabled={isPlaying && currentStep >= steps.length - 1}
        >
          {isPlaying ? '⏸️ Pause' : '▶️ Play'}
        </button>
        <button className="control-btn reset-btn" onClick={handleReset}>
          🔄 Reset
        </button>
        <div className="progress-text">
          Step {currentStep + 1} of {steps.length}
        </div>
      </div>

      {/* Timeline */}
      <div className="sequence-timeline">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          const isSelected = index === selectedStep;
          
          return (
            <div 
              key={step.id}
              className={`timeline-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => handleStepClick(index)}
            >
              <div className="step-connector">
                {index < steps.length - 1 && (
                  <div className={`connector-line ${isCompleted ? 'filled' : ''}`}></div>
                )}
              </div>
              
              <div className="step-content">
                <div className="step-icon">{step.icon}</div>
                <div className="step-info">
                  <div className="step-number">Step {step.id}</div>
                  <h4 className="step-title">{step.title}</h4>
                  <p className="step-description">{step.description}</p>
                  <div className="step-time">⏱️ {step.time}</div>
                </div>
              </div>

              {/* Expanded Details */}
              {(isActive || isSelected) && (
                <div className="step-details">
                  <div className="detail-section">
                    <h5>📋 What Happens:</h5>
                    <p>{step.details}</p>
                  </div>
                  <div className="detail-section technical">
                    <h5>🔧 Technical Details:</h5>
                    <code>{step.technical}</code>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="sequence-summary">
        <h4>⏱️ Total Time: {flowType === 'query' ? '~2.3 seconds' : '~65 seconds (10-page PDF)'}</h4>
        <div className="summary-breakdown">
          {flowType === 'query' ? (
            <>
              <div className="summary-item">
                <span className="summary-label">Network/API:</span>
                <span className="summary-value">~75ms</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Guardrails:</span>
                <span className="summary-value">~100ms</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Vector Search:</span>
                <span className="summary-value">~200ms</span>
              </div>
              <div className="summary-item highlight">
                <span className="summary-label">Claude Generation:</span>
                <span className="summary-value">~2000ms</span>
              </div>
            </>
          ) : (
            <>
              <div className="summary-item">
                <span className="summary-label">Upload to S3:</span>
                <span className="summary-value">~3 seconds</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Triggering:</span>
                <span className="summary-value">~700ms</span>
              </div>
              <div className="summary-item highlight">
                <span className="summary-label">Bedrock Processing:</span>
                <span className="summary-value">~60 seconds</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">OpenSearch Indexing:</span>
                <span className="summary-value">~5 seconds</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Key Insights */}
      <div className="sequence-insights">
        <h4>💡 Key Insights</h4>
        {flowType === 'query' ? (
          <ul>
            <li><strong>87% of time</strong> is spent in Claude generating the answer (unavoidable)</li>
            <li>Vector search takes only <strong>200ms</strong> to search through thousands of documents</li>
            <li>Guardrails add <strong>100ms total</strong> but prevent harmful content</li>
            <li>Warm Lambda invocations respond in <strong>&lt;100ms</strong></li>
            <li><strong>DR (Frontend):</strong> CloudFront origin group fails over to S3 (E1) on <strong>5xx</strong></li>
            <li><strong>DR (Backend):</strong> Switch API to us-east-1 manually via <code>config.json</code> (or client-side retry if implemented)</li>
          </ul>
        ) : (
          <ul>
            <li><strong>92% of time</strong> is Bedrock processing the document (varies by size/format)</li>
            <li>Direct S3 upload bypasses Lambda, saving <strong>time & cost</strong></li>
            <li>Event-driven architecture means <strong>no polling</strong> needed</li>
            <li>Pre-signed URLs expire after <strong>5 minutes</strong> for security</li>
            <li><strong>DR:</strong> Documents auto-replicate to us-east-1 within <strong>15 minutes</strong> (RPO)</li>
          </ul>
        )}
      </div>
    </div>
  );
};

export default AnimatedSequence;


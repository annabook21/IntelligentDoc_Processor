import React, { useState } from 'react';
import './FlowDiagram.css';

const FlowDiagram = () => {
  const [activeNode, setActiveNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  const nodes = [
    { id: 'user', label: '👤 User', x: 50, y: 50, category: 'external', color: '#8C4FFF' },
    { id: 'cloudfront', label: '☁️ CloudFront', x: 200, y: 50, category: 'cdn', color: '#8C4FFF' },
    { id: 's3-frontend', label: '💾 S3 Frontend', x: 350, y: 50, category: 'storage', color: '#569A31' },
    
    { id: 'apigateway', label: '🔌 API Gateway', x: 200, y: 200, category: 'api', color: '#FF4F8B' },
    { id: 'lambda-query', label: '⚡ Query Lambda', x: 350, y: 200, category: 'compute', color: '#FF9900' },
    
    { id: 'bedrock-kb', label: '🧠 Bedrock KB', x: 500, y: 200, category: 'ai', color: '#01A88D' },
    { id: 'opensearch', label: '🔍 OpenSearch', x: 650, y: 200, category: 'database', color: '#146EB4' },
    
    { id: 'claude', label: '🤖 Claude', x: 500, y: 300, category: 'ai', color: '#01A88D' },
    { id: 'guardrails', label: '🛡️ Guardrails', x: 350, y: 300, category: 'security', color: '#146EB4' },
    
    { id: 's3-docs', label: '💾 S3 Documents', x: 200, y: 400, category: 'storage', color: '#569A31' },
    { id: 'lambda-upload', label: '⚡ Upload Lambda', x: 350, y: 400, category: 'compute', color: '#FF9900' },
    { id: 'lambda-ingest', label: '⚡ Ingest Lambda', x: 500, y: 400, category: 'compute', color: '#FF9900' },
  ];

  const connections = [
    // Frontend Flow
    { from: 'user', to: 'cloudfront', type: 'https', label: 'HTTPS' },
    { from: 'cloudfront', to: 's3-frontend', type: 'fetch', label: 'Fetch Assets' },
    
    // Query Flow
    { from: 'user', to: 'apigateway', type: 'api', label: 'POST /docs' },
    { from: 'apigateway', to: 'lambda-query', type: 'invoke', label: 'Invoke' },
    { from: 'lambda-query', to: 'guardrails', type: 'check', label: 'Input Check' },
    { from: 'lambda-query', to: 'bedrock-kb', type: 'retrieve', label: 'Retrieve Context' },
    { from: 'bedrock-kb', to: 'opensearch', type: 'search', label: 'Vector Search' },
    { from: 'lambda-query', to: 'claude', type: 'generate', label: 'Generate Answer' },
    { from: 'guardrails', to: 'claude', type: 'check', label: 'Output Check' },
    
    // Upload Flow
    { from: 'user', to: 'lambda-upload', type: 'api', label: 'Request URL' },
    { from: 'user', to: 's3-docs', type: 'upload', label: 'Upload File' },
    { from: 's3-docs', to: 'lambda-ingest', type: 'trigger', label: 'S3 Event' },
    { from: 'lambda-ingest', to: 'bedrock-kb', type: 'ingest', label: 'Start Ingestion' },
    { from: 'bedrock-kb', to: 'opensearch', type: 'store', label: 'Store Vectors' },
  ];

  const getNodeDescription = (nodeId) => {
    const descriptions = {
      'user': 'End users accessing the chatbot through their web browser',
      'cloudfront': 'CDN delivering static website files with global caching',
      's3-frontend': 'Storage bucket containing React app files (HTML, JS, CSS)',
      'apigateway': 'RESTful API with 3 endpoints: /docs, /upload, /ingestion-status',
      'lambda-query': 'Orchestrates RAG flow: retrieve context → apply guardrails → call Claude',
      'bedrock-kb': 'Manages document ingestion, chunking, embedding, and semantic retrieval',
      'opensearch': 'Vector database storing 1536-dim embeddings for fast similarity search',
      'claude': 'Claude 3 Sonnet generates natural language answers from context',
      'guardrails': 'Filters harmful content in both questions and answers',
      's3-docs': 'Storage for uploaded documents (PDF, DOCX, TXT)',
      'lambda-upload': 'Generates pre-signed URLs for secure direct uploads',
      'lambda-ingest': 'Triggered by S3 events, starts Bedrock ingestion job'
    };
    return descriptions[nodeId] || '';
  };

  const getRelatedConnections = (nodeId) => {
    return connections.filter(conn => conn.from === nodeId || conn.to === nodeId);
  };

  const isConnectionHighlighted = (connection) => {
    if (!hoveredNode && !activeNode) return false;
    const targetNode = hoveredNode || activeNode;
    return connection.from === targetNode || connection.to === targetNode;
  };

  return (
    <div className="flow-diagram-container">
      <svg className="flow-diagram" viewBox="0 0 850 550" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#FF9900" />
          </marker>
          <marker id="arrowhead-active" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#01A88D" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Render Connections */}
        <g className="connections">
          {connections.map((conn, idx) => {
            const fromNode = nodes.find(n => n.id === conn.from);
            const toNode = nodes.find(n => n.id === conn.to);
            if (!fromNode || !toNode) return null;

            const isHighlighted = isConnectionHighlighted(conn);
            
            return (
              <g key={idx} className={`connection ${isHighlighted ? 'highlighted' : ''}`}>
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  className="connection-line"
                  markerEnd={isHighlighted ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                />
                {isHighlighted && (
                  <text
                    x={(fromNode.x + toNode.x) / 2}
                    y={(fromNode.y + toNode.y) / 2}
                    className="connection-label"
                    textAnchor="middle"
                  >
                    {conn.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Render Nodes */}
        <g className="nodes">
          {nodes.map((node) => {
            const isActive = activeNode === node.id;
            const isHovered = hoveredNode === node.id;
            const isRelated = hoveredNode && getRelatedConnections(hoveredNode).some(
              conn => conn.from === node.id || conn.to === node.id
            );

            return (
              <g 
                key={node.id}
                className={`node ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''} ${isRelated ? 'related' : ''}`}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => setActiveNode(activeNode === node.id ? null : node.id)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <circle
                  r="35"
                  fill={node.color}
                  fillOpacity="0.2"
                  stroke={node.color}
                  strokeWidth="3"
                  filter={isActive || isHovered ? "url(#glow)" : ""}
                />
                <text
                  textAnchor="middle"
                  dy="-5"
                  className="node-icon"
                  fontSize="24"
                >
                  {node.label.split(' ')[0]}
                </text>
                <text
                  textAnchor="middle"
                  dy="15"
                  className="node-label"
                  fontSize="11"
                  fill="#fff"
                >
                  {node.label.split(' ').slice(1).join(' ')}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Info Panel */}
      {activeNode && (
        <div className="diagram-info-panel">
          <div className="info-panel-header">
            <h3>{nodes.find(n => n.id === activeNode)?.label}</h3>
            <button 
              className="close-btn"
              onClick={() => setActiveNode(null)}
            >
              ✕
            </button>
          </div>
          <p className="info-panel-description">
            {getNodeDescription(activeNode)}
          </p>
          <div className="info-panel-connections">
            <h4>Connections:</h4>
            <ul>
              {getRelatedConnections(activeNode).map((conn, idx) => (
                <li key={idx}>
                  {conn.from === activeNode ? '→' : '←'} {conn.label}
                  {' '}
                  {conn.from === activeNode 
                    ? nodes.find(n => n.id === conn.to)?.label 
                    : nodes.find(n => n.id === conn.from)?.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="diagram-legend">
        <h4>💡 Tip: Click nodes to see details • Hover to highlight connections</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#569A31' }}></div>
            <span>Storage</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#8C4FFF' }}></div>
            <span>CDN</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#FF4F8B' }}></div>
            <span>API</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#FF9900' }}></div>
            <span>Compute</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#01A88D' }}></div>
            <span>AI</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#146EB4' }}></div>
            <span>Security/DB</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowDiagram;


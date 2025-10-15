import React, { useState } from 'react';
import './FlowDiagram.css';

const FlowDiagram = () => {
  const [activeNode, setActiveNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  const nodes = [
    // Global / DR Layer
    { id: 'user', label: '👤 User', x: 50, y: 50, category: 'external', color: '#8C4FFF' },
    // Removed Route 53 node (backend DNS failover not used in this deployment)
    
    // Frontend CDN (single distribution with origin failover)
    { id: 'cloudfront', label: '☁️ CloudFront', x: 350, y: 120, category: 'cdn', color: '#569A31' },
    { id: 's3-frontend-primary', label: '💾 S3 FE (W2)', x: 500, y: 120, category: 'storage', color: '#569A31' },
    
    // Primary Region (us-west-2)
    { id: 'apigateway-primary', label: '🔌 API GW (W2)', x: 350, y: 220, category: 'api', color: '#FF4F8B' },
    { id: 'lambda-query-primary', label: '⚡ Query (W2)', x: 500, y: 220, category: 'compute', color: '#FF9900' },
    { id: 'lambda-health-primary', label: '💚 Health (W2)', x: 350, y: 320, category: 'compute', color: '#FF9900' },
    { id: 'bedrock-kb-primary', label: '🧠 KB (W2)', x: 650, y: 220, category: 'ai', color: '#01A88D' },
    { id: 's3-docs-primary', label: '💾 Docs (W2)', x: 500, y: 380, category: 'storage', color: '#569A31' },
    
    // Failover Region (us-east-1)
    { id: 's3-frontend-failover', label: '💾 S3 FE (E1)', x: 500, y: 180, category: 'storage', color: '#569A31' },
    { id: 'apigateway-failover', label: '🔌 API GW (E1)', x: 350, y: 580, category: 'api', color: '#FF4F8B' },
    { id: 'lambda-query-failover', label: '⚡ Query (E1)', x: 500, y: 580, category: 'compute', color: '#FF9900' },
    { id: 'lambda-health-failover', label: '💚 Health (E1)', x: 350, y: 680, category: 'compute', color: '#FF9900' },
    { id: 'bedrock-kb-failover', label: '🧠 KB (E1)', x: 650, y: 580, category: 'ai', color: '#01A88D' },
    { id: 's3-docs-failover', label: '💾 Docs (E1)', x: 500, y: 740, category: 'storage', color: '#569A31' },
  ];

  const connections = [
    // Global Traffic Management
    { from: 'user', to: 'cloudfront', type: 'https', label: 'HTTPS' },
    
    // Backend DNS failover removed; backend API switching is manual/client-side if implemented
    
    // Primary Region - Frontend Flow
    { from: 'cloudfront', to: 's3-frontend-primary', type: 'fetch', label: 'Serve Assets (primary)' },
    // Frontend - Failover Origin (on 5xx)
    { from: 'cloudfront', to: 's3-frontend-failover', type: 'fetch', label: 'Serve Assets (failover on 5xx)' },
    
    // Primary Region - Query Flow  
    { from: 'user', to: 'apigateway-primary', type: 'api', label: 'POST /docs' },
    { from: 'apigateway-primary', to: 'lambda-query-primary', type: 'invoke', label: 'Invoke' },
    { from: 'lambda-query-primary', to: 'bedrock-kb-primary', type: 'retrieve', label: 'Retrieve + Generate' },
    { from: 'apigateway-primary', to: 'lambda-health-primary', type: 'invoke', label: 'GET /health' },
    
    // Primary Region - Data Storage & Replication
    { from: 's3-docs-primary', to: 's3-docs-failover', type: 'replicate', label: 'Cross-Region Replication' },
    
    // Failover Region - Query Flow (Standby)
    { from: 'user', to: 'apigateway-failover', type: 'failover-api', label: 'POST /docs (if primary down)' },
    { from: 'apigateway-failover', to: 'lambda-query-failover', type: 'invoke', label: 'Invoke' },
    { from: 'lambda-query-failover', to: 'bedrock-kb-failover', type: 'retrieve', label: 'Retrieve + Generate' },
    { from: 'apigateway-failover', to: 'lambda-health-failover', type: 'invoke', label: 'GET /health' },
  ];

  const getNodeDescription = (nodeId) => {
    const descriptions = {
      'user': 'End users accessing the chatbot through their web browser from anywhere in the world',
      // Route 53 removed in this deployment; backend API switching is manual/client-side if implemented
      
      // Primary Region
      'cloudfront': 'Global CDN with origin group: serves from S3 (W2) and fails over to S3 (E1) on 5xx',
      's3-frontend-primary': 'Primary S3 bucket containing React app files (HTML, JS, CSS) in us-west-2',
      'apigateway-primary': 'Primary REST API in us-west-2 with endpoints: /docs, /upload, /ingestion-status, /health',
      'lambda-query-primary': 'Primary Query Lambda (us-west-2): Retrieve from KB → Apply guardrails → Generate answer with Claude',
      'lambda-health-primary': 'Primary Health Lambda (us-west-2): Tests Bedrock KB connectivity, returns 200 if healthy or 503 if degraded',
      'bedrock-kb-primary': 'Primary Knowledge Base (us-west-2): Manages ingestion, chunking, embeddings, and semantic retrieval',
      's3-docs-primary': 'Primary Documents bucket (us-west-2): Stores uploads, triggers ingestion, replicates to us-east-1',
      
      // Failover Region
      's3-frontend-failover': 'Failover S3 bucket containing React app files in us-east-1 (standby)',
      'apigateway-failover': 'Failover REST API in us-east-1. Receives traffic only if primary region is unhealthy.',
      'lambda-query-failover': 'Failover Query Lambda (us-east-1): Identical to primary, serves requests during outages',
      'lambda-health-failover': 'Failover Health Lambda (us-east-1): Route 53 monitors this to confirm failover region is ready',
      'bedrock-kb-failover': 'Failover Knowledge Base (us-east-1): Contains replicated documents from primary region',
      's3-docs-failover': 'Failover Documents bucket (us-east-1): Receives replicated documents from us-west-2 (15-min lag)',
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
      <svg className="flow-diagram" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid meet">
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
        <h4>💡 Frontend DR: Automatic CloudFront Origin Failover (W2 → E1 on 5xx)</h4>
        <p style={{fontSize: '12px', marginTop: '5px', marginBottom: '10px'}}>
          Frontend: CloudFront origin group automatically serves from S3 (W2) and instantly fails over to S3 (E1) on 5xx errors. No DNS change, same CloudFront URL. Backend: Manual API switch via config.json or custom client-side retry.
        </p>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#569A31' }}></div>
            <span>Storage/CDN</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#8C4FFF' }}></div>
            <span>Global/DR</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#FF4F8B' }}></div>
            <span>API Gateway</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#FF9900' }}></div>
            <span>Lambda</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#01A88D' }}></div>
            <span>AI/Bedrock</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowDiagram;


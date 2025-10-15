import React, { useState } from 'react';
import './Documentation.css';
import ServiceCard from './ServiceCard';
import FlowDiagram from './FlowDiagram';
import AnimatedSequence from './AnimatedSequence';

const Documentation = () => {
  const [expandedService, setExpandedService] = useState(null);
  const [activeFlow, setActiveFlow] = useState('query');
  const [numUsers, setNumUsers] = useState(100);
  const [numQueries, setNumQueries] = useState(500);

  const services = [
    {
      id: 's3',
      icon: '💾',
      name: 'Amazon S3',
      category: 'Storage',
      color: '#569A31',
      shortDesc: 'Three buckets with three different jobs',
      responsibilities: [
        'Frontend Bucket: Stores website files (HTML, JS, CSS)',
        'Documents Bucket: Stores uploaded files and triggers processing',
        'DR Bucket: Keeps backup copies in different region'
      ],
      analogy: 'Think of S3 like three different filing cabinets: one for your website, one for your documents, and one for emergency backups.',
      details: {
        frontend: {
          responsibility: 'Store the website files and serve them to CloudFront',
          tasks: [
            'Holds index.html, JavaScript bundles, CSS files, and config.json',
            'Blocks all public access (only CloudFront can read)',
            'Versions files for rollback capability'
          ],
          doesNot: [
            'Run any code or process anything',
            'Talk to users directly',
            'Execute JavaScript'
          ]
        },
        documents: {
          responsibility: 'Be the source of truth for uploaded documents and trigger processing',
          tasks: [
            'Accepts uploaded files (PDF, DOCX, TXT, MD)',
            'Stores files with versioning enabled',
            'Triggers ObjectCreated event when new file arrives',
            'Sends event to Ingestion Lambda'
          ],
          critical: 'This bucket is the TRIGGER for the entire ingestion pipeline. No upload = no processing.',
          doesNot: [
            'Read or process documents (Bedrock does that)',
            'Know what\'s in the files (just stores bytes)'
          ]
        }
      }
    },
    {
      id: 'cloudfront',
      icon: '☁️',
      name: 'CloudFront',
      category: 'CDN',
      color: '#8C4FFF',
      shortDesc: 'Global CDN with origin failover (private S3 REST origins via OAC)',
      responsibilities: [
        'Cache static files at 450+ edge locations globally',
        'Enforce HTTPS and manage SSL certificates',
        'Protect S3 from direct access using OAC (no public buckets)',
        'Fail over from primary S3 origin (us-west-2) to failover S3 origin (us-east-1) on 5xx',
        'Handle SPA routing by mapping 404 → index.html'
      ],
      analogy: 'Two private warehouses behind one storefront. If the first warehouse is unavailable, the storefront automatically fetches from the second.',
      keyMetric: 'Cache hit ratio should be above 80% (most requests served from cache, not S3)',
      details: {
        caching: 'CloudFront serves cached assets from the nearest edge. On first miss, it fetches from the S3 origin, then caches.',
        security: 'Both S3 origins are private. Access is allowed only for this account\'s CloudFront distributions using OAC (AWS:SourceArn).',
        failover: 'Origin group retries requests against the failover S3 origin if the primary returns 5xx. Users keep the same CloudFront URL.',
        spa: '404s are mapped to index.html so client-side routing works.'
      }
    },
    {
      id: 'apigateway',
      icon: '🔌',
      name: 'API Gateway',
      category: 'API',
      color: '#FF4F8B',
      shortDesc: 'Request router and bouncer with security',
      responsibilities: [
        'Expose four HTTP endpoints: /docs, /upload, /ingestion-status, /health',
        'Validate requests BEFORE they hit Lambda',
        'Apply throttling: 100 req/sec, 200 burst limit',
        'Log everything to CloudWatch',
        'Handle CORS for frontend'
      ],
      analogy: 'Like a bouncer at a club - checks your ID (validates request), controls how many people enter (throttling), and keeps a guest list (logs).',
      endpoints: [
        { method: 'POST', path: '/docs', target: 'Query Lambda', purpose: 'Submit questions' },
        { method: 'POST', path: '/upload', target: 'Upload Lambda', purpose: 'Get pre-signed URL' },
        { method: 'GET', path: '/ingestion-status', target: 'Status Lambda', purpose: 'Check job status' },
        { method: 'GET', path: '/health', target: 'Health Lambda', purpose: 'System health for DR' }
      ],
      critical: 'API Gateway is the ONLY entry point to your backend. If it goes down, entire API is unavailable (99.95% uptime SLA).'
    },
    {
      id: 'lambda',
      icon: '⚡',
      name: 'AWS Lambda',
      category: 'Compute',
      color: '#FF9900',
      shortDesc: 'Five serverless workers, each with a specific job',
      functions: [
        {
          name: 'Query Lambda',
          responsibility: 'Orchestrate the RAG process (Retrieve + Generate + Filter)',
          steps: [
            'Receive and validate user question',
            'Call Bedrock Knowledge Base Retrieve API',
            'Build augmented prompt with context',
            'Apply Guardrail (input filtering)',
            'Invoke Claude 3 Sonnet',
            'Apply Guardrail (output filtering)',
            'Format citations',
            'Return to API Gateway'
          ],
          timeout: '29 seconds (matches API Gateway limit)',
          errors: 'Retries with exponential backoff, handles throttling'
        },
        {
          name: 'Upload Lambda',
          responsibility: 'Generate secure, temporary URLs for direct S3 uploads',
          steps: [
            'Receive filename from frontend',
            'Validate filename and extension',
            'Generate unique S3 key with timestamp',
            'Create pre-signed URL (expires in 5 minutes)',
            'Return URL to frontend'
          ],
          security: 'URLs expire after 5 minutes, only allow PUT, scoped to specific filename'
        },
        {
          name: 'Ingestion Lambda',
          responsibility: 'Tell Bedrock to process new document when it arrives',
          trigger: 'S3 ObjectCreated:Put event',
          steps: [
            'Receive S3 event notification',
            'Extract bucket name and object key',
            'Call Bedrock StartIngestionJob API',
            'Return job ID for status tracking'
          ],
          critical: 'Must execute within 15 seconds or S3 will retry event (potential duplicates)',
          errorHandling: 'Retries 2 times, then sends to Dead Letter Queue'
        },
        {
          name: 'Status Lambda',
          responsibility: 'Check status of Bedrock ingestion job',
          steps: [
            'Receive job ID from frontend',
            'Call Bedrock GetIngestionJob API',
            'Return simplified status (STARTING, IN_PROGRESS, COMPLETE, FAILED)'
          ],
          polling: 'Frontend polls every 5 seconds until COMPLETE or FAILED'
        },
        {
          name: 'Health Check Lambda',
          responsibility: 'Monitor system health for disaster recovery',
          steps: [
            'Test Bedrock Knowledge Base connectivity',
            'Verify Lambda execution environment',
            'Check configuration and environment variables',
            'Return health status: healthy (200) or unhealthy (503)'
          ],
          trigger: 'Route 53 health checks (every 30 seconds)',
          critical: 'Used by Route 53 for automatic failover to backup region'
        }
      ],
      costComparison: 'Regular server: $50/month 24/7. Lambda: ~$0.20 for 1,000 questions/month'
    },
    {
      id: 'bedrock-kb',
      icon: '🧠',
      name: 'Bedrock Knowledge Base',
      category: 'AI',
      color: '#01A88D',
      shortDesc: 'Document processing and retrieval engine',
      responsibilities: [
        'Monitor S3 for new documents',
        'Extract text from multiple formats',
        'Split text into 500-token chunks with 20% overlap',
        'Generate embeddings for each chunk',
        'Store chunks in OpenSearch',
        'Perform semantic search for queries'
      ],
      subServices: [
        {
          name: 'Data Source Manager',
          tasks: ['Monitor S3 bucket', 'Track processed files', 'Queue documents for processing']
        },
        {
          name: 'Ingestion Pipeline',
          tasks: [
            'Extract text (PDF -> OCR, DOCX -> XML, TXT -> direct)',
            'Chunk into 500 tokens with 100 token overlap',
            'Generate 1536-dimensional embeddings',
            'Tag with metadata (source, chunk index, timestamp)',
            'Store in OpenSearch index'
          ],
          timing: 'Typical 10-page PDF: ~60 seconds to process'
        },
        {
          name: 'Retrieval API',
          tasks: [
            'Convert query to embedding vector',
            'Search OpenSearch using k-NN',
            'Rank by cosine similarity',
            'Return top-5 chunks with scores'
          ],
          speed: 'Sub-100ms search across millions of vectors'
        }
      ],
      magic: 'Traditional search looks for exact words. This understands meaning: "refund policy" finds "money-back guarantee" and "reimbursement terms"'
    },
    {
      id: 'titan',
      icon: '🔢',
      name: 'Titan Embeddings G1',
      category: 'AI',
      color: '#01A88D',
      shortDesc: 'Text-to-vector converter',
      responsibility: 'Convert text into 1536-dimensional vectors that capture semantic meaning',
      process: [
        'Accept text input (max 8,192 tokens)',
        'Tokenize into subwords',
        'Pass through 12 transformer layers',
        'Generate contextual embeddings',
        'Pool into single 1536-dimensional vector',
        'Normalize to unit length'
      ],
      whyVectors: 'Each dimension captures a different semantic feature. Similar meanings = similar vectors.',
      example: {
        refund: '[0.23, -0.45, 0.67, ...]',
        reimbursement: '[0.25, -0.43, 0.69, ...] - Very similar!',
        elephant: '[-0.89, 0.12, -0.34, ...] - Very different'
      },
      keyProperty: 'Same text always produces same vector. Synonyms produce similar vectors.'
    },
    {
      id: 'claude',
      icon: '🤖',
      name: 'Claude 3 Sonnet',
      category: 'AI',
      color: '#01A88D',
      shortDesc: 'The answer generator',
      responsibility: 'Read context and question, write natural language answer',
      contextWindow: '200K tokens (~150,000 words)',
      process: [
        'Receive augmented prompt with context chunks',
        'Process through 40+ transformer layers',
        'Generate tokens one at a time (autoregressive)',
        'Apply temperature of 0.7 for controlled randomness',
        'Stop at complete sentence or max_tokens=2048'
      ],
      hallucination: 'Prompt explicitly says "Use ONLY the following context" - Claude respects this, but may occasionally add information. Citations help verify.',
      doesNot: [
        'Search for information (receives it from Query Lambda)',
        'Access the internet',
        'Remember previous conversations (stateless)'
      ],
      whyNotChatGPT: 'ChatGPT has general knowledge but doesn\'t know about YOUR specific documents. It might make up answers or give outdated info. This system uses only YOUR uploaded documents for accurate, source-verified answers.'
    },
    {
      id: 'guardrails',
      icon: '🛡️',
      name: 'Bedrock Guardrails',
      category: 'Security',
      color: '#146EB4',
      shortDesc: 'Content safety filter',
      responsibility: 'Block harmful content in both inputs (queries) and outputs (answers)',
      filters: [
        { type: 'Hate speech', strength: 'HIGH', blocks: 'Obvious slurs + subtle coded language' },
        { type: 'Violence', strength: 'HIGH', blocks: 'Graphic descriptions + implied threats' },
        { type: 'Sexual content', strength: 'HIGH', blocks: 'Explicit + implicit references' },
        { type: 'Insults', strength: 'HIGH', blocks: 'Direct attacks + veiled insults' }
      ],
      twoPass: 'User query -> Guardrail (input) -> Claude -> Guardrail (output) -> User',
      example: 'User asks: "How do I hack into the system?" -> Guardrail blocks BEFORE Claude sees it -> User sees: "I can\'t help with that request"',
      whyExists: 'Extra safety layer. Like having password AND facial recognition. Plus audit logs for compliance.'
    },
    {
      id: 'opensearch',
      icon: '🔍',
      name: 'OpenSearch Serverless',
      category: 'Database',
      color: '#146EB4',
      shortDesc: 'Vector database for fast similarity search',
      responsibility: 'Store document embeddings and perform fast similarity searches',
      indexStructure: {
        vector: '1536-dimensional k-NN vector',
        text: 'Original chunk text',
        source: 'S3 URI of source document',
        chunkIndex: 'Position in original document'
      },
      algorithm: 'HNSW (Hierarchical Navigable Small World) - multi-layer graph for sub-100ms search',
      whyNotMySQL: 'MySQL compares text exactly. OpenSearch compares 1,536-dimensional vectors using cosine similarity in milliseconds. MySQL would take minutes.',
      scale: 'Handles millions of vectors with consistent sub-100ms query time'
    },
    {
      id: 'cloudwatch-dashboard',
      icon: '📊',
      name: 'CloudWatch Dashboard',
      category: 'Monitoring',
      color: '#FF9900',
      shortDesc: 'Real-time metrics visualization and system monitoring',
      responsibility: 'Provide unified view of system health, performance, and errors across all services',
      dashboardName: 'contextual-chatbot-metrics',
      widgets: [
        {
          name: 'API Gateway Performance',
          metrics: ['Total Requests', '4xx Client Errors', '5xx Server Errors'],
          purpose: 'Track API usage and identify client vs server errors'
        },
        {
          name: 'Lambda Errors',
          metrics: ['Query Lambda errors', 'Ingestion Lambda errors'],
          purpose: 'Detect function failures requiring investigation'
        },
        {
          name: 'Lambda Performance',
          metrics: ['Query duration', 'Ingestion duration'],
          purpose: 'Identify performance bottlenecks and optimization opportunities'
        },
        {
          name: 'Dead Letter Queue',
          metrics: ['Failed ingestion messages'],
          purpose: 'Track documents that failed processing'
        },
        {
          name: 'Lambda Invocations',
          metrics: ['Query invocations', 'Ingestion invocations'],
          purpose: 'Monitor usage patterns and scaling behavior'
        }
      ],
      defaultView: '3 hours with auto-adapting time range',
      whyExists: 'Single pane of glass for all system metrics. Instead of checking 5 different CloudWatch pages, see everything in one dashboard. Critical for debugging and capacity planning.'
    },
    {
      id: 'route53',
      icon: '🌐',
      name: 'Route 53 Health Checks',
      category: 'DR',
      color: '#8C4FFF',
      shortDesc: 'Automatic failover monitoring and traffic routing',
      responsibility: 'Monitor both regions and automatically route traffic to healthy endpoints',
      drStrategy: 'Active-Passive with automatic failover',
      healthChecks: [
        {
          region: 'Primary (us-west-2)',
          endpoint: '/health',
          interval: 'Every 30 seconds',
          failureThreshold: '3 consecutive failures (90 seconds)',
          action: 'Route traffic to failover region'
        },
        {
          region: 'Failover (us-east-1)',
          endpoint: '/health',
          interval: 'Every 30 seconds',
          status: 'Standby - receives traffic only if primary fails'
        }
      ],
      whatItChecks: 'The /health endpoint actually calls Bedrock Knowledge Base API to verify backend is operational (not just returning 200 OK)',
      failoverFlow: [
        '1. Route 53 checks primary /health every 30 seconds',
        '2. If 3 consecutive failures detected (90 seconds total)',
        '3. Route 53 updates DNS to point to failover region',
        '4. All new requests go to us-east-1',
        '5. When primary recovers, traffic automatically returns'
      ],
      rto: '2-3 minutes (detection + DNS propagation)',
      rpo: '0-15 minutes (S3 replication lag)',
      costPerMonth: '$1 (2 health checks at $0.50 each)'
    },
    {
      id: 'multi-region',
      icon: '🌍',
      name: 'Multi-Region Architecture',
      category: 'DR',
      color: '#146EB4',
      shortDesc: 'Full stack deployed in two regions for disaster recovery',
      responsibility: 'Ensure application availability even if an entire AWS region fails',
      deployedRegions: [
        {
          name: 'Primary: us-west-2 (Oregon)',
          purpose: 'Handles all traffic under normal conditions',
          components: 'Full stack: API Gateway, 5 Lambdas, Bedrock KB, S3, CloudFront'
        },
        {
          name: 'Failover: us-east-1 (N. Virginia)',
          purpose: 'Standby region that activates if primary fails',
          components: 'Identical stack: API Gateway, 5 Lambdas, Bedrock KB, S3, CloudFront'
        }
      ],
      dataSync: 'S3 Cross-Region Replication ensures documents uploaded to primary are automatically copied to failover (15-minute SLA)',
      realDeployment: 'Both regions are FULLY deployed with real resources, not placeholders. Each region can independently serve all requests.',
      automatedSetup: 'Single CDK command deploys to both regions: cd backend && cdk deploy --all',
      businessValue: 'If Oregon data center fails, application automatically switches to Virginia in under 3 minutes with zero manual intervention.'
    }
  ];

  const calculateCost = () => {
    const s3Storage = Number('0.12');
    const cloudfront = Number('1.00');
    const bedrockBase = Number('4.50');
    const opensearch = Number('2.64');
    const lambdaBase = Number('0.05');
    
    const bedrock = (numQueries / 500) * bedrockBase;
    const lambda = (numQueries / 500) * lambdaBase;
    const singleRegionTotal = s3Storage + cloudfront + bedrock + opensearch + lambda;
    
    // DR costs (optional - for multi-region deployment)
    const drSecondRegion = singleRegionTotal; // Full stack in second region
    const route53HealthChecks = Number('1.00'); // 2 health checks
    const s3Replication = Number('0.20'); // Cross-region data transfer
    const drTotal = drSecondRegion + route53HealthChecks + s3Replication;
    
    return {
      s3: s3Storage.toFixed(2),
      cloudfront: cloudfront.toFixed(2),
      bedrock: bedrock.toFixed(2),
      opensearch: opensearch.toFixed(2),
      lambda: lambda.toFixed(2),
      singleRegion: singleRegionTotal.toFixed(2),
      drCost: drTotal.toFixed(2),
      totalWithDR: (singleRegionTotal + drTotal).toFixed(2)
    };
  };

  const costs = calculateCost();

  return (
    <div className="documentation-container">
      <div className="doc-hero">
        <h1>🏗️ System Architecture</h1>
        <p className="doc-subtitle">
          Interactive guide to understanding how every service works together
        </p>
      </div>

      <div className="doc-content">
        {/* Big Picture */}
        <section className="doc-section">
          <h2>📖 The Big Picture</h2>
          <div className="big-picture-box">
            <p className="big-picture-text">
              <strong>Imagine you have 100 PDF documents about your company's products.</strong> Instead 
              of reading through all of them to answer a question, you just ask the chatbot 
              "How does our warranty work?" and it reads the documents for you, finds the answer, 
              and tells you which document it came from.
            </p>
            <p className="big-picture-text">
              <strong>That's it. That's the whole app.</strong>
            </p>
          </div>
        </section>

        {/* Flow Selector */}
        <section className="doc-section">
          <h2>🔄 Data Flow Animations</h2>
          <div className="flow-selector">
            <button 
              className={`flow-btn ${activeFlow === 'query' ? 'active' : ''}`}
              onClick={() => setActiveFlow('query')}
            >
              💬 Query Flow
            </button>
            <button 
              className={`flow-btn ${activeFlow === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveFlow('upload')}
            >
              📤 Upload Flow
            </button>
          </div>
          <AnimatedSequence flowType={activeFlow} />
        </section>

        {/* Interactive Diagram */}
        <section className="doc-section">
          <h2>🎨 Interactive Architecture</h2>
          <p className="section-desc">Click on any service to see how data flows through the system</p>
          <FlowDiagram />
        </section>

        {/* Service Cards */}
        <section className="doc-section">
          <h2>🔧 Service Deep-Dive</h2>
          <p className="section-desc">Click any card to expand and learn exactly what each service does</p>
          <div className="services-grid">
            {services.map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                isExpanded={expandedService === service.id}
                onToggle={() => setExpandedService(
                  expandedService === service.id ? null : service.id
                )}
              />
            ))}
          </div>
        </section>

        {/* Cost Calculator */}
        <section className="doc-section">
          <h2>💰 Cost Calculator</h2>
          <div className="cost-calculator">
            <div className="calc-inputs">
              <div className="calc-input-group">
                <label>Number of Users:</label>
                <input 
                  type="number" 
                  value={numUsers} 
                  onChange={(e) => setNumUsers(Math.max(1, parseInt(e.target.value) || 1))}
                  onInput={(e) => setNumUsers(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                />
              </div>
              <div className="calc-input-group">
                <label>Queries per Month:</label>
                <input 
                  type="number" 
                  value={numQueries} 
                  onChange={(e) => setNumQueries(Math.max(1, parseInt(e.target.value) || 1))}
                  onInput={(e) => setNumQueries(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                />
              </div>
            </div>
            <div className="calc-results">
              <h3>Estimated Monthly Cost</h3>
              <div className="cost-breakdown">
                <div className="cost-item">
                  <span>S3 Storage:</span>
                  <span className="cost-value">${costs.s3}</span>
                </div>
                <div className="cost-item">
                  <span>CloudFront (CDN):</span>
                  <span className="cost-value">${costs.cloudfront}</span>
                </div>
                <div className="cost-item">
                  <span>Amazon Bedrock (AI):</span>
                  <span className="cost-value">${costs.bedrock}</span>
                </div>
                <div className="cost-item">
                  <span>OpenSearch:</span>
                  <span className="cost-value">${costs.opensearch}</span>
                </div>
                <div className="cost-item">
                  <span>Lambda Functions:</span>
                  <span className="cost-value">${costs.lambda}</span>
                </div>
                <div className="cost-item cost-subtotal">
                  <span><strong>Single Region:</strong></span>
                  <span className="cost-value"><strong>${costs.singleRegion}/month</strong></span>
                </div>
                <div className="cost-item cost-dr">
                  <span><strong>+ Disaster Recovery (optional):</strong></span>
                  <span className="cost-value"><strong>+${costs.drCost}/month</strong></span>
                </div>
                <div className="cost-item cost-total">
                  <span><strong>Total with DR:</strong></span>
                  <span className="cost-value"><strong>${costs.totalWithDR}/month</strong></span>
                </div>
              </div>
              <div className="cost-comparison">
                <p><strong>For Comparison:</strong></p>
                <ul>
                  <li>One employee answering questions manually: ~$4,000/month</li>
                  <li>Running your own server with DR: ~$500/month minimum</li>
                  <li>This serverless solution (single region): <strong>${costs.singleRegion}/month</strong></li>
                  <li>This serverless solution (with DR): <strong>${costs.totalWithDR}/month</strong></li>
                </ul>
                <p style={{marginTop: '15px', color: '#01A88D', fontWeight: 600}}>
                  💡 DR adds ~${costs.drCost}/month but provides &lt;3 minute recovery time if an entire region fails.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Why Each Piece Exists */}
        <section className="doc-section">
          <h2>🤔 Why Each Piece Exists</h2>
          <div className="why-boxes">
            <div className="why-box">
              <h4>Why not just use keywords?</h4>
              <p>Keywords miss synonyms. Searching "car" won't find "vehicle" or "automobile". Vector search understands they mean the same thing.</p>
            </div>
            <div className="why-box">
              <h4>Why not just use ChatGPT?</h4>
              <p>ChatGPT has general knowledge but doesn't know about YOUR specific documents. It might make up answers or give outdated info. This system uses only YOUR uploaded documents for accurate, source-verified answers.</p>
            </div>
            <div className="why-box">
              <h4>Why Lambda instead of a server?</h4>
              <p>Regular server: Runs 24/7, costs $50/month even if nobody uses it. Lambda: Only runs when needed, costs ~$0.20 for 1,000 questions.</p>
            </div>
            <div className="why-box">
              <h4>Why not MySQL for vectors?</h4>
              <p>MySQL compares text exactly. OpenSearch compares 1,536-dimensional vectors using cosine similarity in milliseconds. MySQL would take minutes.</p>
            </div>
          </div>
        </section>

        {/* Bottom Line */}
        <section className="doc-section bottom-line">
          <h2>🎯 The Bottom Line</h2>
          <div className="bottom-line-content">
            <p className="headline">This system does <strong>one thing really well</strong>: it lets you talk to your documents instead of reading them.</p>
            
            <div className="three-columns">
              <div className="column">
                <h4>📥 You Give It</h4>
                <ul>
                  <li>PDFs</li>
                  <li>Word docs</li>
                  <li>Text files</li>
                </ul>
              </div>
              <div className="column">
                <h4>📤 You Get Back</h4>
                <ul>
                  <li>Answers in plain English</li>
                  <li>Citations showing sources</li>
                  <li>Confidence scores</li>
                </ul>
              </div>
              <div className="column">
                <h4>💵 It Costs Less Than</h4>
                <ul>
                  <li>A single employee</li>
                  <li>A single server</li>
                  <li>Most SaaS subscriptions</li>
                </ul>
              </div>
            </div>

            <div className="scale-box">
              <h4>📈 It Scales From:</h4>
              <p>1 user to 1 million users • 10 documents to 10,000 documents</p>
              <p><strong>Without you changing anything.</strong></p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Documentation;


import React from 'react';
import './ServiceCard.css';

const ServiceCard = ({ service, isExpanded, onToggle }) => {
  const categoryColors = {
    'Storage': '#569A31',
    'CDN': '#8C4FFF',
    'API': '#FF4F8B',
    'Compute': '#FF9900',
    'AI': '#01A88D',
    'Security': '#146EB4',
    'Database': '#146EB4'
  };

  return (
    <div 
      className={`service-card ${isExpanded ? 'expanded' : ''}`}
      style={{ borderColor: categoryColors[service.category] }}
    >
      <div 
        className="service-card-header"
        onClick={onToggle}
        style={{ backgroundColor: `${categoryColors[service.category]}15` }}
      >
        <div className="service-icon">{service.icon}</div>
        <div className="service-header-content">
          <h3 className="service-name">{service.name}</h3>
          <span 
            className="service-category"
            style={{ backgroundColor: categoryColors[service.category] }}
          >
            {service.category}
          </span>
        </div>
        <div className={`expand-icon ${isExpanded ? 'rotated' : ''}`}>▼</div>
      </div>

      <div className="service-short-desc">{service.shortDesc}</div>

      {isExpanded && (
        <div className="service-expanded-content">
          {/* Analogy Section */}
          {service.analogy && (
            <div className="service-section analogy-section">
              <div className="section-header">💡 Simple Analogy</div>
              <p className="analogy-text">{service.analogy}</p>
            </div>
          )}

          {/* Responsibilities */}
          {service.responsibilities && (
            <div className="service-section">
              <div className="section-header">🎯 Key Responsibilities</div>
              <ul className="responsibilities-list">
                {service.responsibilities.map((resp, idx) => (
                  <li key={idx}>{resp}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Functions (for Lambda) */}
          {service.functions && (
            <div className="service-section">
              <div className="section-header">⚡ Lambda Functions</div>
              {service.functions.map((func, idx) => (
                <div key={idx} className="function-box">
                  <h4 className="function-name">{func.name}</h4>
                  <p className="function-responsibility">
                    <strong>Responsibility:</strong> {func.responsibility}
                  </p>
                  {func.steps && (
                    <div className="function-steps">
                      <strong>Steps:</strong>
                      <ol>
                        {func.steps.map((step, sIdx) => (
                          <li key={sIdx}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {func.timeout && <p className="function-meta"><strong>Timeout:</strong> {func.timeout}</p>}
                  {func.trigger && <p className="function-meta"><strong>Trigger:</strong> {func.trigger}</p>}
                  {func.critical && <p className="function-critical">⚠️ {func.critical}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Sub-services (for Bedrock KB) */}
          {service.subServices && (
            <div className="service-section">
              <div className="section-header">🔧 Sub-Components</div>
              {service.subServices.map((sub, idx) => (
                <div key={idx} className="sub-service-box">
                  <h4 className="sub-service-name">{sub.name}</h4>
                  <ul>
                    {sub.tasks.map((task, tIdx) => (
                      <li key={tIdx}>{task}</li>
                    ))}
                  </ul>
                  {sub.timing && <p className="sub-service-timing">⏱️ {sub.timing}</p>}
                  {sub.speed && <p className="sub-service-timing">⚡ {sub.speed}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Endpoints (for API Gateway) */}
          {service.endpoints && (
            <div className="service-section">
              <div className="section-header">🔌 API Endpoints</div>
              <div className="endpoints-grid">
                {service.endpoints.map((endpoint, idx) => (
                  <div key={idx} className="endpoint-box">
                    <div className="endpoint-method">{endpoint.method}</div>
                    <div className="endpoint-path">{endpoint.path}</div>
                    <div className="endpoint-purpose">{endpoint.purpose}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Details (for S3) */}
          {service.details && (
            <div className="service-section">
              <div className="section-header">📋 Detailed Breakdown</div>
              {service.details.frontend && (
                <div className="detail-box">
                  <h4>Frontend Bucket</h4>
                  <p><strong>Responsibility:</strong> {service.details.frontend.responsibility}</p>
                  <ul>
                    {service.details.frontend.tasks.map((task, idx) => (
                      <li key={idx}>{task}</li>
                    ))}
                  </ul>
                  <div className="does-not">
                    <strong>Does NOT:</strong>
                    <ul>
                      {service.details.frontend.doesNot.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {service.details.documents && (
                <div className="detail-box">
                  <h4>Documents Bucket</h4>
                  <p><strong>Responsibility:</strong> {service.details.documents.responsibility}</p>
                  <ul>
                    {service.details.documents.tasks.map((task, idx) => (
                      <li key={idx}>{task}</li>
                    ))}
                  </ul>
                  {service.details.documents.critical && (
                    <p className="critical-info">⚠️ {service.details.documents.critical}</p>
                  )}
                </div>
              )}
              {service.details.caching && (
                <div className="detail-box">
                  <h4>Caching Behavior</h4>
                  <p>{service.details.caching}</p>
                </div>
              )}
              {service.details.security && (
                <div className="detail-box">
                  <h4>Security</h4>
                  <p>{service.details.security}</p>
                </div>
              )}
            </div>
          )}

          {/* Filters (for Guardrails) */}
          {service.filters && (
            <div className="service-section">
              <div className="section-header">🛡️ Content Filters</div>
              <div className="filters-grid">
                {service.filters.map((filter, idx) => (
                  <div key={idx} className="filter-box">
                    <div className="filter-type">{filter.type}</div>
                    <div className="filter-strength">{filter.strength}</div>
                    <div className="filter-blocks">{filter.blocks}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Process (for Titan/Claude) */}
          {service.process && (
            <div className="service-section">
              <div className="section-header">⚙️ How It Works</div>
              <ol className="process-list">
                {service.process.map((step, idx) => (
                  <li key={idx} className="process-step">{step}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Example (for Titan) */}
          {service.example && (
            <div className="service-section">
              <div className="section-header">💡 Example Vectors</div>
              <div className="example-box">
                <p><code>"refund"</code> → {service.example.refund}</p>
                <p><code>"reimbursement"</code> → {service.example.reimbursement}</p>
                <p><code>"elephant"</code> → {service.example.elephant}</p>
              </div>
            </div>
          )}

          {/* Key Metrics/Properties */}
          {service.keyMetric && (
            <div className="service-section highlight-section">
              <div className="section-header">📊 Key Metric</div>
              <p>{service.keyMetric}</p>
            </div>
          )}

          {service.critical && (
            <div className="service-section warning-section">
              <div className="section-header">⚠️ Critical Information</div>
              <p>{service.critical}</p>
            </div>
          )}

          {service.magic && (
            <div className="service-section magic-section">
              <div className="section-header">✨ The Magic</div>
              <p>{service.magic}</p>
            </div>
          )}

          {service.whyVectors && (
            <div className="service-section info-section">
              <div className="section-header">🤔 Why Vectors?</div>
              <p>{service.whyVectors}</p>
            </div>
          )}

          {/* Does Not (for Claude) */}
          {service.doesNot && (
            <div className="service-section">
              <div className="section-header">❌ What It Does NOT Do</div>
              <ul>
                {service.doesNot.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Cost Comparison */}
          {service.costComparison && (
            <div className="service-section cost-section">
              <div className="section-header">💰 Cost Comparison</div>
              <p>{service.costComparison}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ServiceCard;


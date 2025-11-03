import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import axios from 'axios';
import LanguageChart from './LanguageChart';
import EntityChart from './EntityChart';
import KeyPhrasesCloud from './KeyPhrasesCloud';
import ProcessingTimeline from './ProcessingTimeline';
import './Dashboard.css';

function Dashboard() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    languages: {},
    entityTypes: {},
    recentProcessing: [],
    duplicates: 0,
  });

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
    // Only load documents when API endpoint is available
    if (apiEndpoint) {
      loadDocuments();
    }
  }, [apiEndpoint]);

  const loadDocuments = async () => {
    if (!API_ENDPOINT) {
      console.error('API endpoint not configured');
      setError('API endpoint not configured. Please refresh the page.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      if (!token) {
        throw new Error('No authentication token. Please sign in again.');
      }

      // Ensure no double slashes in URL
      const endpoint = API_ENDPOINT.endsWith('/') ? API_ENDPOINT.slice(0, -1) : API_ENDPOINT;

      console.log('Fetching documents from:', `${endpoint}/search`);

      // Search for all documents
      const response = await axios.post(
        `${endpoint}/search`,
        { query: '' }, // Empty query returns all
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Documents received:', response.data);

      const docs = (response.data.documents || []).map((doc) => ({
        ...doc,
        status: doc.status || 'PROCESSED',
        duplicateOf: doc.duplicateOf || null,
      }));
      setDocuments(docs);

      // Calculate statistics
      const languageCounts = {};
      const entityTypeCounts = {};
      const recent = [];

      const processedDocs = docs.filter((doc) => (doc.status || 'PROCESSED') === 'PROCESSED');
      const duplicateDocs = docs.filter((doc) => doc.status === 'DUPLICATE');

      processedDocs.forEach((doc) => {
        // Language stats
        const lang = doc.language || 'unknown';
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;

        // Entity stats
        try {
          const entities = typeof doc.entities === 'string' ? JSON.parse(doc.entities) : doc.entities || [];
          entities.forEach((entity) => {
            const type = entity.Type || 'OTHER';
            entityTypeCounts[type] = (entityTypeCounts[type] || 0) + 1;
          });
        } catch (e) {
          // Skip invalid entity data
        }

        // Recent processing (last 10)
        if (doc.processingDate) {
          recent.push({
            documentId: doc.documentId,
            processingDate: doc.processingDate,
          });
        }
      });

      recent.sort((a, b) => new Date(b.processingDate) - new Date(a.processingDate));

      setStats({
        total: processedDocs.length,
        languages: languageCounts,
        entityTypes: entityTypeCounts,
        recentProcessing: recent.slice(0, 10),
        duplicates: duplicateDocs.length,
      });

      setError(null);
    } catch (err) {
      console.error('Error loading documents:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <h1>Document Processing Dashboard</h1>
        <p>Overview of processed documents and insights</p>
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Processed Documents</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Object.keys(stats.languages).length}</div>
          <div className="stat-label">Languages Detected</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {Object.values(stats.entityTypes).reduce((a, b) => a + b, 0)}
          </div>
          <div className="stat-label">Entities Extracted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.duplicates || 0}</div>
          <div className="stat-label">Duplicates Skipped</div>
        </div>
      </div>

      {/* Visualizations */}
      <div className="visualizations-grid">
        <div className="card">
          <h2>Language Distribution</h2>
          <LanguageChart data={stats.languages} />
        </div>

        <div className="card">
          <h2>Entity Type Breakdown</h2>
          <EntityChart data={stats.entityTypes} />
        </div>

        <div className="card">
          <h2>Key Phrases</h2>
          <KeyPhrasesCloud documents={documents} />
        </div>

        <div className="card">
          <h2>Processing Timeline</h2>
          <ProcessingTimeline data={stats.recentProcessing} />
        </div>
      </div>

      {/* Documents Table */}
      <div className="card">
        <h2>Processed Documents</h2>
        {documents.length === 0 ? (
          <div className="empty-state">
            <p>No documents processed yet.</p>
            <Link to="/upload" className="button">
              Upload Your First Document
            </Link>
          </div>
        ) : (
          <div className="documents-table">
            <table>
              <thead>
                <tr>
                  <th>Document ID</th>
                  <th>Status</th>
                  <th>Language</th>
                  <th>Processing Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.slice(0, 20).map((doc) => (
                  <tr key={doc.documentId}>
                    <td>{doc.documentId.substring(0, 20)}...</td>
                    <td>
                      {doc.status === 'DUPLICATE' ? (
                        <span className="status-pill status-duplicate">
                          Duplicate
                          {doc.duplicateOf && (
                            <span className="status-detail"> of {doc.duplicateOf.substring(0, 20)}...</span>
                          )}
                        </span>
                      ) : (
                        <span className="status-pill status-processed">Processed</span>
                      )}
                    </td>
                    <td>{doc.language || 'Unknown'}</td>
                    <td>
                      {doc.processingDate
                        ? new Date(doc.processingDate).toLocaleString()
                        : 'N/A'}
                    </td>
                    <td>
                      <Link
                        to={`/document/${encodeURIComponent(doc.documentId)}`}
                        className="button button-small"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;


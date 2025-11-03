import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import { signOut } from 'aws-amplify/auth';
import '@aws-amplify/ui-react/styles.css';

import Dashboard from './components/Dashboard';
import Upload from './components/Upload';
import DocumentViewer from './components/DocumentViewer';
import Navigation from './components/Navigation';
import './App.css';

function App() {
  const [amplifyConfigured, setAmplifyConfigured] = useState(false);

  // Configure Amplify before rendering Authenticator
  useEffect(() => {
    const configureAmplify = async () => {
      // Default config from environment variables
      let awsconfig = {
        Auth: {
          Cognito: {
            userPoolId: process.env.REACT_APP_USER_POOL_ID || '',
            userPoolClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID || '',
            loginWith: {
              oauth: {
                domain: process.env.REACT_APP_COGNITO_DOMAIN || '',
                scopes: ['email', 'openid', 'profile'],
                redirectSignIn: [
                  process.env.REACT_APP_REDIRECT_URL || 'http://localhost:3000'
                ],
                redirectSignOut: [
                  process.env.REACT_APP_REDIRECT_URL || 'http://localhost:3000'
                ],
                responseType: 'code',
              },
            },
          },
        },
        API: {
          REST: {
            DocumentProcessorAPI: {
              endpoint: process.env.REACT_APP_API_ENDPOINT || '',
              region: process.env.REACT_APP_REGION || 'us-west-2',
            },
          },
        },
      };

      try {
        // Try to load runtime config from config.json (deployed by CDK)
        const response = await fetch('/config.json');
        if (response.ok) {
          const config = await response.json();
          // Override with runtime config
          awsconfig = {
            Auth: {
              Cognito: {
                userPoolId: config.userPoolId,
                userPoolClientId: config.userPoolClientId,
                loginWith: {
                  oauth: {
                    domain: config.cognitoDomain,
                    scopes: ['email', 'openid', 'profile'],
                    redirectSignIn: [config.redirectUrl],
                    redirectSignOut: [config.redirectUrl],
                    responseType: 'code',
                  },
                },
              },
            },
            API: {
              REST: {
                DocumentProcessorAPI: {
                  endpoint: config.apiEndpoint,
                  region: config.region,
                },
              },
            },
          };
          console.log('Amplify configured from config.json');
        }
      } catch (error) {
        // If config.json not found (local dev), use environment variables
        console.log('Using environment variables for configuration (local dev mode)', error);
      }

      // Configure Amplify
      Amplify.configure(awsconfig);
      setAmplifyConfigured(true);
    };

    configureAmplify();
  }, []);

  // Don't render Authenticator until Amplify is configured
  if (!amplifyConfigured) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }
  // Handle "already signed in" error by providing sign out option
  const handleSignOutError = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      console.error('Error signing out:', error);
      // Clear storage as fallback
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  return (
    <Authenticator
      hideSignUp={false}
      components={{
        SignIn: {
          Header() {
            return (
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <h2>Sign in to Document Processor</h2>
              </div>
            );
          },
          Footer() {
            return (
              <div style={{ textAlign: 'center', marginTop: '20px', padding: '10px' }}>
                <button
                  onClick={handleSignOutError}
                  style={{
                    background: 'transparent',
                    border: '1px solid #ccc',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: '#666',
                    fontSize: '14px'
                  }}
                >
                  Clear Session / Sign Out
                </button>
              </div>
            );
          },
        },
      }}
      errorMessage={(error) => {
        if (error.message?.includes('already a signed in user') || 
            error.message?.includes('already signed in')) {
          return (
            <div>
              <p>{error.message}</p>
              <button onClick={handleSignOutError} style={{ marginTop: '10px' }}>
                Sign Out and Try Again
              </button>
            </div>
          );
        }
        return error.message;
      }}
    >
      {({ signOut, user }) => (
        <Router>
          <div className="App">
            <Navigation user={user} signOut={signOut} />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/document/:documentId" element={<DocumentViewer />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </Router>
      )}
    </Authenticator>
  );
}

export default App;


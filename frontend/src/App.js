import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { QAHeader } from "./QAHeader";
import Chat from "./Chat";
import { useState, useEffect } from "react";
import { TextField, Typography, Tabs, Tab } from "@mui/material";
import * as React from "react";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import DeleteIcon from "@mui/icons-material/Delete";
import LoadingSpinner from "./Spinner";
import IconButton from "@mui/material/IconButton";
import SendIcon from "@mui/icons-material/Send";
import FileUpload from "./FileUpload";
import Alert from "@mui/material/Alert";
import Documentation from "./Documentation";

// Component to display the live status of document ingestion
const IngestionStatus = ({ status }) => {
  // Don't render anything if there's no status or if it's an old job
  if (!status || status === 'NO_JOBS_FOUND') {
    return null;
  }

  let message;
  let severity;

  switch (status) {
    case 'STARTING':
    case 'IN_PROGRESS':
      message = "⏳ Ingesting new document... The chatbot will have context once this is complete.";
      severity = "info";
      break;
    case 'COMPLETE':
      message = "✅ Ingestion complete! It may take a minute for the new context to become available.";
      severity = "success";
      break;
    case 'FAILED':
      message = "❌ Ingestion failed. Please check the document and try uploading again.";
      severity = "error";
      break;
    default:
      // Don't render for unknown statuses
      return null;
  }

  return (
    <Alert severity={severity} sx={{ mt: 2, mb: 2 }}>
      {message}
    </Alert>
  );
};

const App = (props) => {
  const [history, setHistory] = useState([]);
  const [baseUrl, setBaseUrl] = useState(undefined);
  const [question, setQuestion] = useState('');
  const [spinner, setSpinner] = useState(false);
  const [sessionId, setSessionId] = useState(undefined);
  const [ingestionStatus, setIngestionStatus] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  // Load API URL from config.json at startup
  useEffect(() => {
    fetch('/config.json')
      .then(res => res.json())
      .then(config => {
        if (config.apiUrl) {
          setBaseUrl(config.apiUrl);
        }
      })
      .catch(err => {
        console.warn('Could not load config.json, API URL must be entered manually:', err);
      });
  }, []);

  // Effect for polling the ingestion status endpoint
  useEffect(() => {
    let intervalId;

    const checkStatus = async () => {
      if (!baseUrl) return;
      try {
        const response = await fetch(`${baseUrl}ingestion-status`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        setIngestionStatus(data.status);

        // If the job is finished (complete or failed), stop polling
        if (data.status === 'COMPLETE' || data.status === 'FAILED') {
          clearInterval(intervalId);
          // Hide the status message after 20 seconds to ensure the user sees it
          setTimeout(() => setIngestionStatus(null), 20000);
        }
      } catch (err) {
        console.error("Error checking ingestion status:", err);
        clearInterval(intervalId); // Stop polling on error
      }
    };

    // Start polling only when an ingestion is known to be in progress
    if (ingestionStatus === 'STARTING' || ingestionStatus === 'IN_PROGRESS') {
      intervalId = setInterval(checkStatus, 5000); // Poll every 5 seconds
    }

    // Cleanup function to clear the interval when the component unmounts or dependencies change
    return () => clearInterval(intervalId);
  }, [ingestionStatus, baseUrl]);

  const handleSendQuestion = () => {
    setSpinner(true);

    fetch(baseUrl + "docs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestSessionId: sessionId,
        question: question,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("data", data);
        setSpinner(false);
        setSessionId(data.sessionId);
        setHistory([
          ...history,
          {
            question: question,
            response: data.response,
            citation: data.citation,
          },
        ]);
      })
      .catch((err) => {
        setSpinner(false);
        setHistory([
          ...history,
          {
            question: question,
            response:
              "Error generating an answer. Please check your browser console, WAF configuration, Bedrock model access, and Lambda logs for debugging the error.",
            citation: undefined,
          },
        ]);
      });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSendQuestion();
    }
  };

  const onClearHistory = () => setHistory([]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        padding: { xs: "20px", sm: "30px", md: "40px" },
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      }}
    >
      <Paper
        elevation={3}
        sx={{
          padding: { xs: 3, sm: 4, md: 6 },
          maxWidth: { xs: "100%", sm: "800px", md: "1000px", lg: "1100px" },
          width: "100%",
          margin: "0 auto",
          borderRadius: 4,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          backdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
        }}
      >
        <Typography 
          variant="h4" 
          sx={{ 
            textAlign: "center",
            fontWeight: 600,
            background: 'linear-gradient(45deg, #FF9900 30%, #232F3E 90%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 1
          }}
        >
          AWS Contextual Chatbot Demo
        </Typography>
        <Typography 
          variant="body2" 
          sx={{ 
            textAlign: "center", 
            color: "text.secondary",
            mb: 3
          }}
        >
          Powered by Amazon Bedrock Knowledge Bases
        </Typography>

        <Tabs 
          value={activeTab} 
          onChange={(event, newValue) => setActiveTab(newValue)}
          centered
          sx={{ mb: 3 }}
        >
          <Tab label="💬 Chatbot" />
          <Tab label="📚 Architecture" />
        </Tabs>

        {activeTab === 0 && (
          <>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <QAHeader
                setBaseUrl={setBaseUrl}
                baseUrl={baseUrl}
              />
              <Divider sx={{ my: 3 }} />

              <Typography variant="overline" sx={{ paddingBottom: "10px", fontSize: "0.9rem", fontWeight: 500 }}>
                2. Upload Documents (Optional):
              </Typography>
              <FileUpload baseUrl={baseUrl} onUploadStart={() => setIngestionStatus('STARTING')} />
              <IngestionStatus status={ingestionStatus} />
              
              <Divider sx={{ my: 3 }} />

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: "10px",
                  paddingTop: "20px",
                }}
              >
                <Typography variant="overline" sx={{ fontSize: "0.9rem", fontWeight: 500 }}>3. Ask a question:</Typography>
                <Button
                  disabled={history.length === 0}
                  startIcon={<DeleteIcon />}
                  onClick={onClearHistory}
                >
                  Clear History
                </Button>
              </Box>
              <Chat history={history} />
              <br></br>
              {spinner ? (
                <Box sx={{ justifyContent: "center", padding: "20px" }}>
                  <LoadingSpinner />
                </Box>
              ) : (
                <br></br>
              )}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: "20px",
                  paddingTop: "20px",
                }}
              >
                <TextField
                  disabled={spinner || !baseUrl}
                  variant="standard"
                  label="Enter your question here"
                  value={question}
                  onChange={(e) => setQuestion(e.target?.value)}
                  onKeyDown={handleKeyDown}
                  sx={{ width: "95%" }}
                />
                <IconButton
                  disabled={spinner || !baseUrl}
                  onClick={handleSendQuestion}
                  color="primary"
                >
                  <SendIcon />
                </IconButton>
              </Box>
            </Box>
          </>
        )}

        {activeTab === 1 && (
          <Documentation />
        )}
      </Paper>
    </Box>
  );
};

export default App;

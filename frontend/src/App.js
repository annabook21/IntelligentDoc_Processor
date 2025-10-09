import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { QAHeader } from "./QAHeader";
import Chat from "./Chat";
import { useState, useEffect } from "react";
import { TextField, Typography } from "@mui/material";
import * as React from "react";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import DeleteIcon from "@mui/icons-material/Delete";
import LoadingSpinner from "./Spinner";
import IconButton from "@mui/material/IconButton";
import SendIcon from "@mui/icons-material/Send";
import UrlSourcesForm from "./WebUrlsForm";
import FileUpload from "./FileUpload";
import {modelList} from "./RAGModels"
import Alert from "@mui/material/Alert";

// Add a new component for the status indicator
const IngestionStatus = ({ status }) => {
  if (!status || status === 'COMPLETE' || status === 'NO_JOBS_FOUND') {
    return null;
  }

  let message = "Processing document...";
  let severity = "info";

  if (status === 'IN_PROGRESS' || status === 'STARTING') {
    message = "⏳ Ingesting new document... The chatbot will have context once this is complete.";
  } else if (status === 'FAILED') {
    message = "❌ Ingestion failed. Please check the file and try again.";
    severity = "error";
  }

  return (
    <Alert severity={severity} sx={{ mt: 2, mb: 2 }}>
      {message}
    </Alert>
  );
};

const App = (props) => {
  const [history, setHistory] = useState([]);
  const [selectedModel, setSelectedModel] = useState(undefined);
  const [baseUrl, setBaseUrl] = useState(undefined);
  const [question, setQuestion] = useState('');
  const [spinner, setSpinner] = useState(false);
  const [sessionId, setSessionId] = useState(undefined);
  const [sourceUrlInfo, setSourceUrlInfo] = useState({
    exclusionFilters: [],
    inclusionFilters: [],
    seedUrlList: [],
  });
  const [hasWebDataSource, setHasWebDataSource] = useState(false);
  const [ingestionStatus, setIngestionStatus] = useState(null);

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

  // Polling logic for ingestion status
  useEffect(() => {
    let intervalId;

    const checkStatus = async () => {
      if (!baseUrl) return;
      try {
        const response = await fetch(`${baseUrl}ingestion-status`);
        const data = await response.json();
        setIngestionStatus(data.status);

        if (data.status === 'COMPLETE' || data.status === 'FAILED') {
          clearInterval(intervalId);
          // Hide the status message after a few seconds
          setTimeout(() => setIngestionStatus(null), 5000);
        }
      } catch (err) {
        console.error("Error checking ingestion status:", err);
        clearInterval(intervalId);
      }
    };

    if (ingestionStatus === 'STARTING' || ingestionStatus === 'IN_PROGRESS') {
      intervalId = setInterval(checkStatus, 5000); // Poll every 5 seconds
    }

    return () => clearInterval(intervalId);
  }, [ingestionStatus, baseUrl]);

  useEffect(() => {
    if (!baseUrl) {
      return;
    }
    const getWebSourceConfiguration = async () => {
      fetch(baseUrl + "urls", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })
        .then((res) => res.json())
        .then((data) => {
          setSourceUrlInfo({
            exclusionFilters: data.exclusionFilters ?? [],
            inclusionFilters: data.inclusionFilters ?? [],
            seedUrlList: data.seedUrlList ?? [],
          });
          setHasWebDataSource(true);
        })
        .catch((err) => {
          console.log("err", err);
        });

    };
    getWebSourceConfiguration();
  }, [baseUrl]);

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
        modelId: selectedModel?.modelId,
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

  const handleUpdateUrls = async (
    urls,
    newExclusionFilters,
    newInclusionFilters
  ) => {
    try {
      const response = await fetch(baseUrl + "web-urls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          urlList: [...new Set(urls)],
          exclusionFilters: [...new Set(newExclusionFilters)],
          inclusionFilters: [...new Set(newInclusionFilters)],
        }),
      });
      return !!response.ok;
    } catch (error) {
      console.log("Error:", error);
      return false;
    }
  };

  const handleChangeModel = (model) => {
    setSelectedModel(model);
    setSessionId(undefined)
  }

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        padding: "30px",
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      }}
    >
      <Paper
        elevation={3}
        sx={{
          padding: 6,
          maxWidth: 700,
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
        <br></br>
        <br></br>
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
            modelList={modelList}
            setSelectedModel={handleChangeModel}
            selectedModel={selectedModel}
          />
          <Divider sx={{ my: 3 }} />

          <Typography variant="overline" sx={{ paddingBottom: "10px", fontSize: "0.9rem", fontWeight: 500 }}>
            2. Upload Documents (Optional):
          </Typography>
          <FileUpload baseUrl={baseUrl} onUploadComplete={() => setIngestionStatus('STARTING')} />
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
        </Box>
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
        {hasWebDataSource ? (
          <Box sx={{ paddingTop: "15px" }}>
            <UrlSourcesForm
              exclusionFilters={sourceUrlInfo.exclusionFilters}
              inclusionFilters={sourceUrlInfo.inclusionFilters}
              seedUrlList={sourceUrlInfo.seedUrlList.map(
                (urlObj) => urlObj.url
              )}
              handleUpdateUrls={handleUpdateUrls}
            />
          </Box>
        ) : null}
      </Paper>
    </Box>
  );
};

export default App;

import React, { useState, useEffect } from "react";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import { Typography } from "@mui/material";
import InputAdornment from "@mui/material/InputAdornment";
import InputIcon from "@mui/icons-material/Link";
import PropTypes from "prop-types";

export const QAHeader = (props) => {
  const { setBaseUrl, baseUrl } = props;
  const [url, setUrl] = useState(baseUrl ?? "");
  
  useEffect(() => {
    if (baseUrl) {
      setUrl(baseUrl);
    }
  }, [baseUrl]);

  return (
    <>
      <Typography variant="overline" sx={{ paddingBottom: "10px", fontSize: "0.9rem", fontWeight: 500 }}>
        1. Configure API URL:
      </Typography>
      <TextField
        variant="standard"
        fullWidth
        value={url}
        label="API URL"
        onChange={(e) => setUrl(e.target?.value)}
        onBlur={() => setBaseUrl(url)}
        disabled={!!baseUrl}
        helperText={baseUrl ? "API URL is auto-configured." : "Enter the API Gateway URL from your deployment."}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <InputIcon />
            </InputAdornment>
          ),
        }}
      />
    </>
  );
};

QAHeader.propTypes = {
  setBaseUrl: PropTypes.func,
  baseUrl: PropTypes.string,
};

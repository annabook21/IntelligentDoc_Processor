"use strict";

// asset-input/node_modules/@middy/core/index.js
var import_node_stream = require("node:stream");
var import_web = require("node:stream/web");
var import_promises = require("node:stream/promises");
var import_node_timers = require("node:timers");
var defaultLambdaHandler = () => {
};
var defaultPlugin = {
  timeoutEarlyInMillis: 5,
  timeoutEarlyResponse: () => {
    const err = new Error("[AbortError]: The operation was aborted.", {
      cause: { package: "@middy/core" }
    });
    err.name = "TimeoutError";
    throw err;
  },
  streamifyResponse: false
  // Deprecate need for this when AWS provides a flag for when it's looking for it
};
var middy = (lambdaHandler = defaultLambdaHandler, plugin = {}) => {
  if (typeof lambdaHandler !== "function") {
    plugin = lambdaHandler;
    lambdaHandler = defaultLambdaHandler;
  }
  plugin = { ...defaultPlugin, ...plugin };
  plugin.timeoutEarly = plugin.timeoutEarlyInMillis > 0;
  plugin.beforePrefetch?.();
  const beforeMiddlewares = [];
  const afterMiddlewares = [];
  const onErrorMiddlewares = [];
  const middyHandler = (event = {}, context = {}) => {
    plugin.requestStart?.();
    const request = {
      event,
      context,
      response: void 0,
      error: void 0,
      internal: plugin.internal ?? {}
    };
    return runRequest(
      request,
      beforeMiddlewares,
      lambdaHandler,
      afterMiddlewares,
      onErrorMiddlewares,
      plugin
    );
  };
  const middy2 = plugin.streamifyResponse ? awslambda.streamifyResponse(async (event, responseStream, context) => {
    const handlerResponse = await middyHandler(event, context);
    let handlerBody = handlerResponse;
    if (handlerResponse.statusCode) {
      handlerBody = handlerResponse.body ?? "";
      delete handlerResponse.body;
      responseStream = awslambda.HttpResponseStream.from(
        responseStream,
        handlerResponse
      );
    }
    let handlerStream;
    if (handlerBody._readableState || handlerBody instanceof import_web.ReadableStream) {
      handlerStream = handlerBody;
    } else if (typeof handlerBody === "string") {
      handlerStream = import_node_stream.Readable.from(
        handlerBody.length < stringIteratorSize ? handlerBody : stringIterator(handlerBody)
      );
    }
    if (!handlerStream) {
      throw new Error("handler response not a ReadableStream");
    }
    await (0, import_promises.pipeline)(handlerStream, responseStream);
  }) : middyHandler;
  middy2.use = (middlewares) => {
    if (!Array.isArray(middlewares)) {
      middlewares = [middlewares];
    }
    for (const middleware of middlewares) {
      const { before, after, onError } = middleware;
      if (before || after || onError) {
        if (before) middy2.before(before);
        if (after) middy2.after(after);
        if (onError) middy2.onError(onError);
      } else {
        throw new Error(
          'Middleware must be an object containing at least one key among "before", "after", "onError"'
        );
      }
    }
    return middy2;
  };
  middy2.before = (beforeMiddleware) => {
    beforeMiddlewares.push(beforeMiddleware);
    return middy2;
  };
  middy2.after = (afterMiddleware) => {
    afterMiddlewares.unshift(afterMiddleware);
    return middy2;
  };
  middy2.onError = (onErrorMiddleware) => {
    onErrorMiddlewares.unshift(onErrorMiddleware);
    return middy2;
  };
  middy2.handler = (replaceLambdaHandler) => {
    lambdaHandler = replaceLambdaHandler;
    return middy2;
  };
  return middy2;
};
var stringIteratorSize = 16384;
function* stringIterator(input) {
  let position = 0;
  const length = input.length;
  while (position < length) {
    yield input.substring(position, position + stringIteratorSize);
    position += stringIteratorSize;
  }
}
var handlerAbort = new AbortController();
var runRequest = async (request, beforeMiddlewares, lambdaHandler, afterMiddlewares, onErrorMiddlewares, plugin) => {
  let timeoutID;
  const timeoutEarly = plugin.timeoutEarly && request.context.getRemainingTimeInMillis;
  try {
    await runMiddlewares(request, beforeMiddlewares, plugin);
    if (!Object.prototype.hasOwnProperty.call(request, "earlyResponse")) {
      plugin.beforeHandler?.();
      if (handlerAbort.signal.aborted) {
        handlerAbort = new AbortController();
      }
      const promises = [
        lambdaHandler(request.event, request.context, {
          signal: handlerAbort.signal
        })
      ];
      if (timeoutEarly) {
        let timeoutResolve;
        const timeoutPromise = new Promise((resolve, reject) => {
          timeoutResolve = () => {
            handlerAbort.abort();
            try {
              resolve(plugin.timeoutEarlyResponse());
            } catch (e) {
              reject(e);
            }
          };
        });
        timeoutID = (0, import_node_timers.setTimeout)(
          timeoutResolve,
          request.context.getRemainingTimeInMillis() - plugin.timeoutEarlyInMillis
        );
        promises.push(timeoutPromise);
      }
      request.response = await Promise.race(promises);
      if (timeoutID) {
        clearTimeout(timeoutID);
      }
      plugin.afterHandler?.();
      await runMiddlewares(request, afterMiddlewares, plugin);
    }
  } catch (e) {
    if (timeoutID) {
      clearTimeout(timeoutID);
    }
    request.response = void 0;
    request.error = e;
    try {
      await runMiddlewares(request, onErrorMiddlewares, plugin);
    } catch (e2) {
      e2.originalError = request.error;
      request.error = e2;
      throw request.error;
    }
    if (typeof request.response === "undefined") throw request.error;
  } finally {
    await plugin.requestEnd?.(request);
  }
  return request.response;
};
var runMiddlewares = async (request, middlewares, plugin) => {
  for (const nextMiddleware of middlewares) {
    plugin.beforeMiddleware?.(nextMiddleware.name);
    const res = await nextMiddleware(request);
    plugin.afterMiddleware?.(nextMiddleware.name);
    if (typeof res !== "undefined") {
      request.earlyResponse = res;
    }
    if (Object.prototype.hasOwnProperty.call(request, "earlyResponse")) {
      request.response = request.earlyResponse;
      return;
    }
  }
};
var core_default = middy;

// asset-input/node_modules/@middy/util/index.js
var createErrorRegexp = /[^a-zA-Z]/g;
var HttpError = class extends Error {
  constructor(code, message, options = {}) {
    if (message && typeof message !== "string") {
      options = message;
      message = void 0;
    }
    message ??= httpErrorCodes[code];
    super(message, options);
    const name = httpErrorCodes[code].replace(createErrorRegexp, "");
    this.name = name.substr(-5) !== "Error" ? name + "Error" : name;
    this.status = this.statusCode = code;
    this.expose = options.expose ?? code < 500;
  }
};
var createError = (code, message, properties = {}) => {
  return new HttpError(code, message, properties);
};
var httpErrorCodes = {
  100: "Continue",
  101: "Switching Protocols",
  102: "Processing",
  103: "Early Hints",
  200: "OK",
  201: "Created",
  202: "Accepted",
  203: "Non-Authoritative Information",
  204: "No Content",
  205: "Reset Content",
  206: "Partial Content",
  207: "Multi-Status",
  208: "Already Reported",
  226: "IM Used",
  300: "Multiple Choices",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  305: "Use Proxy",
  306: "(Unused)",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Payload Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a teapot",
  421: "Misdirected Request",
  422: "Unprocessable Entity",
  423: "Locked",
  424: "Failed Dependency",
  425: "Unordered Collection",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  506: "Variant Also Negotiates",
  507: "Insufficient Storage",
  508: "Loop Detected",
  509: "Bandwidth Limit Exceeded",
  510: "Not Extended",
  511: "Network Authentication Required"
};

// asset-input/node_modules/@middy/http-json-body-parser/index.js
var mimePattern = /^application\/(.+\+)?json($|;.+)/;
var defaults = {
  reviver: void 0,
  disableContentTypeError: false
};
var httpJsonBodyParserMiddleware = (opts = {}) => {
  const options = { ...defaults, ...opts };
  const httpJsonBodyParserMiddlewareBefore = async (request) => {
    const { headers, body } = request.event;
    const contentType = headers?.["content-type"] ?? headers?.["Content-Type"];
    if (!mimePattern.test(contentType)) {
      if (options.disableContentTypeError) {
        return;
      }
      throw createError(415, "Unsupported Media Type", {
        cause: { package: "@middy/http-json-body-parser", data: contentType }
      });
    }
    if (typeof body === "undefined") {
      throw createError(415, "Invalid or malformed JSON was provided", {
        cause: { package: "@middy/http-json-body-parser", data: body }
      });
    }
    try {
      const data = request.event.isBase64Encoded ? Buffer.from(body, "base64").toString() : body;
      request.event.body = JSON.parse(data, options.reviver);
    } catch (err) {
      throw createError(415, "Invalid or malformed JSON was provided", {
        cause: {
          package: "@middy/http-json-body-parser",
          data: body,
          message: err.message
        }
      });
    }
  };
  return {
    before: httpJsonBodyParserMiddlewareBefore
  };
};
var http_json_body_parser_default = httpJsonBodyParserMiddleware;

// asset-input/node_modules/@middy/http-header-normalizer/index.js
var exceptionsList = [
  "ALPN",
  "C-PEP",
  "C-PEP-Info",
  "CalDAV-Timezones",
  "Content-ID",
  "Content-MD5",
  "DASL",
  "DAV",
  "DNT",
  "ETag",
  "GetProfile",
  "HTTP2-Settings",
  "Last-Event-ID",
  "MIME-Version",
  "Optional-WWW-Authenticate",
  "Sec-WebSocket-Accept",
  "Sec-WebSocket-Extensions",
  "Sec-WebSocket-Key",
  "Sec-WebSocket-Protocol",
  "Sec-WebSocket-Version",
  "SLUG",
  "TCN",
  "TE",
  "TTL",
  "WWW-Authenticate",
  "X-ATT-DeviceId",
  "X-DNSPrefetch-Control",
  "X-UIDH"
];
var exceptions = exceptionsList.reduce((acc, curr) => {
  acc[curr.toLowerCase()] = curr;
  return acc;
}, {});
var normalizeHeaderKey = (key, canonical) => {
  const lowerCaseKey = key.toLowerCase();
  if (!canonical) {
    return lowerCaseKey;
  }
  if (exceptions[lowerCaseKey]) {
    return exceptions[lowerCaseKey];
  }
  return lowerCaseKey.split("-").map((text) => (text[0] || "").toUpperCase() + text.substr(1)).join("-");
};
var defaults2 = {
  canonical: false,
  defaultHeaders: {},
  normalizeHeaderKey
};
var httpHeaderNormalizerMiddleware = (opts = {}) => {
  const options = { ...defaults2, ...opts };
  const defaultHeaders = {};
  const defaultMultiValueHeaders = {};
  for (const key of Object.keys(options.defaultHeaders)) {
    const newKey = options.normalizeHeaderKey(key, options.canonical);
    const isArray = Array.isArray(options.defaultHeaders[key]);
    defaultHeaders[newKey] = isArray ? options.defaultHeaders[key].join(",") : options.defaultHeaders[key];
    defaultMultiValueHeaders[newKey] = isArray ? options.defaultHeaders[key] : options.defaultHeaders[key].split(",");
  }
  const httpHeaderNormalizerMiddlewareBefore = async (request) => {
    if (request.event.headers) {
      const headers = { ...defaultHeaders };
      for (const key of Object.keys(request.event.headers)) {
        headers[options.normalizeHeaderKey(key, options.canonical)] = request.event.headers[key];
      }
      request.event.headers = headers;
    }
    if (request.event.multiValueHeaders) {
      const headers = { ...defaultMultiValueHeaders };
      for (const key of Object.keys(request.event.multiValueHeaders)) {
        headers[options.normalizeHeaderKey(key, options.canonical)] = request.event.multiValueHeaders[key];
      }
      request.event.multiValueHeaders = headers;
    }
  };
  return {
    before: httpHeaderNormalizerMiddlewareBefore
  };
};
var http_header_normalizer_default = httpHeaderNormalizerMiddleware;

// asset-input/lambda/query/index.js
var {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand
} = require("@aws-sdk/client-bedrock-agent-runtime");
var client = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION
});
exports.handler = core_default().use(http_json_body_parser_default()).use(http_header_normalizer_default()).handler(async (event, context) => {
  const { question, requestSessionId, modelId } = event.body;
  try {
    console.log("model", modelId);
    const input = {
      sessionId: requestSessionId,
      input: {
        text: question
      },
      retrieveAndGenerateConfiguration: {
        type: "KNOWLEDGE_BASE",
        knowledgeBaseConfiguration: {
          knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
          //Claude Instant v1.2 is a fast, affordable yet still very capable model, which can handle a range of tasks including casual dialogue, text analysis, summarization, and document question-answering.
          modelArn: modelId ? `arn:aws:bedrock:${process.env.AWS_REGION}::foundation-model/${modelId}` : `arn:aws:bedrock:${process.env.AWS_REGION}::foundation-model/anthropic.claude-instant-v1`
        }
      }
    };
    const command = new RetrieveAndGenerateCommand(input);
    const response = await client.send(command);
    console.log("query response citation", response.citations);
    response.citations.forEach((c) => console.log("generatedResponsePart: ", c.generatedResponsePart, " retrievedReferences: ", c.retrievedReferences));
    const location = response.citations[0]?.retrievedReferences[0]?.location;
    const sourceType = location?.type;
    switch (sourceType) {
      case "S3":
        return makeResults(200, response.output.text, location?.s3Location.uri, response.sessionId);
      case "WEB":
        return makeResults(200, response.output.text, location?.webLocation.url, response.sessionId);
      default:
        return makeResults(200, response.output.text, null, response.sessionId);
    }
  } catch (err) {
    console.log(err);
    return makeResults(500, "Server side error: please check function logs", null, null);
  }
});
function makeResults(statusCode, responseText, citationText, responseSessionId) {
  return {
    statusCode,
    body: JSON.stringify({
      response: responseText,
      citation: citationText,
      sessionId: responseSessionId
    }),
    headers: {
      "Access-Control-Allow-Origin": "*"
    }
  };
}

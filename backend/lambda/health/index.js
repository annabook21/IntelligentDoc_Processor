const {
  BedrockAgentClient,
  GetKnowledgeBaseCommand,
} = require("@aws-sdk/client-bedrock-agent");

const client = new BedrockAgentClient({ region: process.env.AWS_REGION });

/**
 * Health Check Lambda
 * 
 * This performs REAL health checks, not just returning 200 OK.
 * Tests actual connectivity to critical AWS services.
 * 
 * Returns:
 * - 200: All systems operational
 * - 503: Service degraded or unavailable
 */
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  const startTime = Date.now();
  const healthChecks = {
    region: process.env.AWS_REGION,
    timestamp: new Date().toISOString(),
    checks: {},
  };

  try {
    // 1. Check Knowledge Base connectivity (REAL check, not placeholder)
    try {
      const kbCommand = new GetKnowledgeBaseCommand({
        knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
      });
      
      const kbResponse = await client.send(kbCommand);
      
      healthChecks.checks.knowledgeBase = {
        status: "healthy",
        message: `Knowledge Base accessible: ${kbResponse.knowledgeBase?.name || 'unnamed'}`,
        responseTime: Date.now() - startTime,
      };
    } catch (kbError) {
      console.error("Knowledge Base health check failed:", kbError);
      healthChecks.checks.knowledgeBase = {
        status: "unhealthy",
        message: `Knowledge Base inaccessible: ${kbError.message}`,
        error: kbError.name,
      };
    }

    // 2. Check if we can access environment variables (sanity check)
    healthChecks.checks.configuration = {
      status: process.env.KNOWLEDGE_BASE_ID ? "healthy" : "unhealthy",
      message: process.env.KNOWLEDGE_BASE_ID 
        ? "Environment variables configured" 
        : "Missing required environment variables",
    };

    // 3. Check Lambda execution environment
    healthChecks.checks.lambda = {
      status: "healthy",
      message: "Lambda execution environment operational",
      memoryLimit: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
      timeRemaining: event.requestContext ? "N/A" : context?.getRemainingTimeInMillis?.(),
    };

    // Determine overall health status
    const allHealthy = Object.values(healthChecks.checks).every(
      check => check.status === "healthy"
    );

    const responseTime = Date.now() - startTime;

    if (allHealthy) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "healthy",
          message: "All systems operational",
          ...healthChecks,
          totalResponseTime: responseTime,
        }),
      };
    } else {
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          status: "degraded",
          message: "Some systems are unhealthy",
          ...healthChecks,
          totalResponseTime: responseTime,
        }),
      };
    }
  } catch (error) {
    console.error("Health check critical error:", error);
    
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        status: "unhealthy",
        message: "Health check failed",
        error: error.message,
        region: process.env.AWS_REGION,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};


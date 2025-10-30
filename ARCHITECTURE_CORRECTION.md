# Architecture Correction: Following AWS Bedrock Flows Pattern

## Issue Identified

The current architecture incorrectly uses:
- ❌ Lambda → Bedrock Agent → Bedrock Flow (incorrect pattern)
- ❌ Too many Lambda functions as wrappers

## Correct Pattern (Per AWS Documentation)

Per [AWS Bedrock Flows Tutorial](https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started-mortgage-flow.html):

### ✅ Correct Architecture

```
S3 Upload → S3 Event → EventBridge Rule → Bedrock Flow (direct invocation via bedrock-runtime:InvokeFlow)
                                                      ↓
                                              Flow Orchestrates:
                                              - Lambda Tools (as actions within Flow)
                                              - Direct API integrations
                                              - Conditional logic nodes
                                              - Output
```

### Key Principles

1. **Bedrock Flow is the orchestrator** - It contains nodes that define the workflow
2. **Lambda functions are TOOLS** - Registered as actions/tools within the Flow, not wrappers around it
3. **Direct invocation** - Flows are invoked directly via `bedrock-runtime:InvokeFlow`, not through Agents
4. **Agents are optional** - Agents can be nodes utilities within Flows for conversational workflows, but not required for batch processing

## Revised Lambda Functions

### Infrastructure Lambdas (2) - Required for CDK
1. `flow-creator.js` - Custom resource to create Flow
2. `tool-registrar.js` - Registers Lambda functions as tools with the Flow

### Tool Lambdas (4) - Used BY the Flow as actions
1. `textract-tool.js` - Extracts text from documents (used as ToolUse node in Flow)
2. `comprehend-tool.js` - Detects language, entities, phrases (used as ToolUse node in Flow)
3. `dynamodb-tool.js` - Writes metadata (used as ToolUse node in Flow)
4. `opensearch-tool.js` - Indexes content (used as ToolUse node in Flow)

### Optional Bridge Lambda (0-1)
- `eventbridge-bridge.js` - Only needed if EventBridge can't directly invoke Bedrock Flow
- **OR** Use API Gateway with Bedrock Runtime integration

### API Handlers (1) - For search/metadata queries
- `api-handler.js` - Consolidated handler for search, metadata, health endpoints

**Total: 7-8 Lambdas** (but 4 are tools used BY the Flow, not wrappers)

## Flow Definition Structure

The Flow should define nodes like:
- **Input Node**: Receives S3 bucket/key
- **ToolUse Nodes**: Call Lambda tools (Textract, Comprehend, DynamoDB, OpenSearch)
- **Prompt Node**: Use Claude for summarization
- **Condition Nodes**: Route based on processing results
- **Output Node**: Return processing status

## Next Steps

1. Redesign Flow definition to follow AWS pattern
2. Create Lambda functions as tools (not orchestrators)
3. Set up EventBridge rule to invoke Flow directly
4. Update CDK stack to follow correct pattern


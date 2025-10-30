# Code Cleanup Audit - Issues Found

## ❌ Problems Identified

### 1. Unused/Incorrect Lambda Functions
- `agent-creator.js` - **UNNECESSARY** - Flows don't require Agents for batch processing
- `document-processor.js` - **WRONG PATTERN** - Shouldn't use Lambda to invoke Flow
- `search-handler.js`, `metadata-handler.js`, `health-handler.js` - Could be consolidated

### 2. Wrong Architecture Pattern
- Current: S3 → SQS → Lambda → Agent → Flow ❌
- Correct: S3 → EventBridge → Flow (direct invocation) ✅

### 3. Unused Files
- `intelligent-doc-processor-stack-optimized.ts` - Incomplete duplicate stack
- `api-handler.js` - Created but not properly integrated

### 4. Flow Definition Issues
- `document-processing-flow.json` - Uses incorrect node types (ToolUse with non-existent tools)

## ✅ Correct Pattern (Per AWS Samples)

Based on https://github.com/aws-samples/amazon-bedrock-flows-samples:

1. **Flow Definition**: JSON file with proper node types (Input, Prompt, Condition, Iterator, Collector, Output)
2. **Flow Invocation**: Direct via `bedrock-runtime:InvokeFlow` 
3. **Lambda Tools**: Only if Flow needs custom actions (Textract wrapper, DynamoDB writer, etc.)
4. **Infrastructure**: Custom resource Lambda to create Flow (for CDK)

## Cleanup Plan

1. Delete unnecessary files
2. Redesign Flow definition to match AWS pattern
3. Remove Agent creation (not needed)
4. Use EventBridge to invoke Flow directly
5. Create only necessary Lambda tools (if Flow needs them)


#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { IntelligentDocProcessorStack } from '../lib/intelligent-doc-processor-stack';

const app = new cdk.App();

/**
 * Intelligent Document Processing Pipeline
 * 
 * Architecture using Bedrock Agents and Flows for modern serverless document processing.
 * 
 * Deployment:
 *   1. Bootstrap region (one-time):
 *      cdk bootstrap aws://<account>/us-west-2
 * 
 *   2. Deploy stack:
 *      cdk deploy IntelligentDocProcessorStack
 * 
 * Prerequisites:
 * - Bedrock model access enabled for:
 *   - amazon.titan-embed-text-v1 (for embeddings)
 *   - anthropic.claude-3-sonnet-20240229-v1:0 (for processing)
 * - Docker Desktop running (for custom resource bundling if needed)
 */

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-west-2';

new IntelligentDocProcessorStack(app, 'IntelligentDocProcessorStack', {
  env: { 
    account: account, 
    region: region
  },
  description: 'Intelligent Document Processing Pipeline with Bedrock Agents and Flows',
});


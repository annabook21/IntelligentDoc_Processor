#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BackendStack } from '../lib/backend-stack';

const app = new cdk.App();

/**
 * Multi-Region Deployment Configuration
 * 
 * This stack uses AWS CLI configuration (CDK_DEFAULT_ACCOUNT, CDK_DEFAULT_REGION)
 * to determine the deployment region. This allows deployment to any region
 * without code changes.
 * 
 * Supported Regions (verify Bedrock model availability):
 * - us-west-2 (Oregon) ✅ Verified
 * - us-east-1 (N. Virginia) ⚠️ Verify Bedrock models
 * - us-east-2 (Ohio) ⚠️ Verify Bedrock models
 * 
 * REQUIRED MODELS:
 * - amazon.titan-embed-text-v1 (Titan Embeddings)
 * - anthropic.claude-3-sonnet-20240229-v1:0 (Claude 3 Sonnet)
 * 
 * To deploy to a specific region:
 *   export AWS_DEFAULT_REGION=us-east-1
 *   cdk bootstrap aws://<account-id>/us-east-1
 *   cdk deploy
 * 
 * For more information: https://docs.aws.amazon.com/cdk/latest/guide/environments.html
 */
new BackendStack(app, 'BackendStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
  description: `AWS Contextual Chatbot with Bedrock RAG (Region: ${process.env.CDK_DEFAULT_REGION || 'default'})`,
});
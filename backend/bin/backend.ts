#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BackendStack } from '../lib/backend-stack';

const app = new cdk.App();

/**
 * Multi-Region Deployment Configuration
 * 
 * This creates separate stacks for primary (us-west-2) and failover (us-east-1) regions.
 * AWS CDK best practice for disaster recovery: deploy same stack to multiple regions.
 * 
 * Deployment:
 *   1. Bootstrap both regions (one-time):
 *      cdk bootstrap aws://<account>/us-west-2
 *      cdk bootstrap aws://<account>/us-east-1
 * 
 *   2. Deploy all stacks:
 *      cdk deploy --all
 * 
 * Prerequisites:
 * - Bedrock model access enabled in BOTH regions:
 *   - amazon.titan-embed-text-v1
 *   - anthropic.claude-3-sonnet-20240229-v1:0
 * - Docker Desktop running (for Lambda bundling)
 * 
 * Documentation: https://docs.aws.amazon.com/cdk/latest/guide/environments.html
 */

const account = process.env.CDK_DEFAULT_ACCOUNT;

// Primary region (us-west-2)
new BackendStack(app, 'BackendStack-Primary', {
  env: { 
    account: account, 
    region: 'us-west-2'
  },
  description: 'AWS Contextual Chatbot with Bedrock RAG - Primary (us-west-2)',
});

// Failover region (us-east-1) for disaster recovery
new BackendStack(app, 'BackendStack-Failover', {
  env: { 
    account: account, 
    region: 'us-east-1'
  },
  description: 'AWS Contextual Chatbot with Bedrock RAG - Failover (us-east-1)',
});
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SimplifiedDocProcessorStack } from '../lib/simplified-doc-processor-stack';

const app = new cdk.App();

/**
 * Simplified Intelligent Document Processing Pipeline
 * 
 * Following AWS Workshop Pattern: https://catalog.workshops.aws/intelligent-document-processing/en-US
 * 
 * Architecture:
 *   S3 Upload → EventBridge → Lambda Function
 *                              ↓
 *                       - Textract (extract text)
 *                       - Comprehend (language, entities, phrases)
 *                       - DynamoDB (store metadata)
 * 
 * Deployment:
 *   1. Bootstrap region (one-time):
 *      cdk bootstrap aws://<account>/us-west-2
 * 
 *   2. Deploy stack:
 *      cdk deploy SimplifiedDocProcessorStack
 * 
 * Prerequisites:
 * - AWS CLI configured
 * - Docker Desktop running (for Lambda bundling)
 */

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-west-2';

new SimplifiedDocProcessorStack(app, 'SimplifiedDocProcessorStack', {
  env: { 
    account: account, 
    region: region
  },
  description: 'Simplified Intelligent Document Processing Pipeline following AWS Workshop pattern',
});


Great idea 👍 — your current README is solid, but it’s missing all the gotchas we just worked through. Here’s an **updated version** with improved prerequisites, clearer step-by-step deployment, and troubleshooting tips that match what you hit:

---

# Contextual Chatbot with Amazon Bedrock Knowledge Bases

This project provides a fully deployable, self-contained contextual chatbot application using Amazon Bedrock Knowledge Bases. It features a complete backend infrastructure defined in AWS CDK and a simple React frontend.

---

## Architecture

The entire application is defined as Infrastructure as Code (IaC), allowing for easy and repeatable deployments. The architecture consists of a serverless backend, a document ingestion pipeline, and a web-based frontend.

```mermaid
graph TD
    subgraph "User Interaction"
        User[<fa:fa-user> User] -->|1. Accesses UI| FE_CF[<fa:fa-cloud> CloudFront Distribution]
        FE_CF -->|2. Serves static content| FE_S3[<fa:fa-box-archive> S3 Frontend Bucket]
        User -->|3. Sends Query| APIGW[<fa:fa-server> API Gateway]
    end

    subgraph "Data Ingestion"
        Admin[<fa:fa-user-shield> Admin] -->|A. Uploads File| DS_S3[<fa:fa-box-archive> S3 Docs Bucket]
        DS_S3 -->|B. Triggers Event| IngestLambda[<fa:fa-bolt> Ingestion Lambda]
        IngestLambda -->|C. Starts Job| BedrockKB[<fa:fa-brain> Bedrock Knowledge Base]
        DS_S3 -->|Replicates to| DR_S3[<fa:fa-box-archive> S3 DR Bucket]
    end

    subgraph "Backend Logic"
        APIGW -->|4. Invokes| QueryLambda[<fa:fa-bolt> Query Lambda]
        QueryLambda -->|5. Retrieves & Generates| BedrockKB
        BedrockKB -->|6. Returns Response & Citations| QueryLambda
        QueryLambda -->|7. Returns to User| APIGW
    end

    style User fill:#f9f,stroke:#333,stroke-width:2px
    style Admin fill:#ccf,stroke:#333,stroke-width:2px
```

---

## Core Components

*(kept unchanged — frontend, API Gateway, backend, ingestion pipeline as in your draft)*

---

## Deployment

### Prerequisites

Make sure you have these installed/configured first:

* **AWS CLI** installed and configured (`aws configure`) with valid access key/secret key.

  * Verify with: `aws sts get-caller-identity`
* **Node.js** ≥ 22.9.0 and npm.
* **AWS CDK CLI**:

  ```bash
  npm install -g aws-cdk
  ```
* **Docker Desktop** installed and running (required for bundling Lambda assets).
* **Set your region** to `us-west-2` (or your preferred one):

  ```bash
  export AWS_DEFAULT_REGION=us-west-2
  ```

### Steps

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd <repository-name>/backend
   ```
2. **Install dependencies**

   ```bash
   npm install
   npm install aws-cdk-lib constructs typescript ts-node --save-dev
   ```
3. **Bootstrap your AWS account**
   *(only needed once per account/region)*

   ```bash
   cdk bootstrap aws://<your-account-id>/us-west-2
   ```

   🔹 If you see `StagingBucket already exists` errors, delete the old bucket `cdk-hnb659fds-assets-<account>-us-west-2` in S3 and re-run bootstrap.
4. **Synthesize the stack**

   ```bash
   cdk synth
   ```

   This outputs the CloudFormation template so you can preview what will be deployed.
5. **Deploy**

   ```bash
   cdk deploy
   ```

   This creates all the resources (API Gateway, S3 buckets, Lambdas, CloudFront, etc.).

---

## Usage

1. Copy the **CloudFront URL** from the deployment output.
2. Open it in your browser to access the chatbot UI.
3. Upload documents into the **DocsBucketName** S3 bucket (also shown in output).
4. The ingestion Lambda will process files and add them to the knowledge base automatically.
5. Use the web UI to ask questions — answers will include citations from your uploaded docs.

---

## Troubleshooting

* **Error: `Cannot connect to the Docker daemon`**
  → Make sure Docker Desktop is installed and running. Test with `docker ps`.
* **Error: `SSM parameter /cdk-bootstrap/... not found`**
  → Run `cdk bootstrap aws://<account>/us-west-2`.
* **Error: `StagingBucket already exists` during bootstrap**
  → Delete the old S3 bucket `cdk-hnb659fds-assets-<account>-us-west-2` or rerun bootstrap with `--bootstrap-bucket-name`.
* **Deploying to wrong region (`us-east-1` instead of `us-west-2`)**
  → Set region in `bin/backend.ts`:

  ```ts
  new BackendStack(app, 'BackendStack', {
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-west-2' }
  });
  ```

  Or set `export AWS_DEFAULT_REGION=us-west-2` before deploying.



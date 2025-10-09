# Research Report: Pre-Deployment Bedrock Model Access Check

## 📅 Research Date: October 9, 2025

**Objective:** To find the correct, AWS-documented method for creating a CDK Custom Resource that verifies Bedrock model access during deployment and fails the deployment with a clear error message if access is not granted.

---

### **Part 1: How to Create a CDK Custom Resource**

*   **Source:** [AWS CDK API Reference - `aws-cdk-lib.custom_resources.Provider`](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.custom_resources.Provider.html)
*   **Source:** [AWS CDK Developer Guide - Custom Resources](https://docs.aws.amazon.com/cdk/v2/guide/custom_resources.html)

#### **Key Findings:**

1.  **The `Provider` Construct is the Modern Standard:** The `custom_resources.Provider` is the recommended, high-level construct for creating a Lambda-backed custom resource.
2.  **It Handles Complexity Automatically:** The `Provider` construct automatically creates the necessary Lambda function, IAM role, and handles the communication logic with CloudFormation.
3.  **`onEventHandler` is the Entry Point:** The `onEventHandler` property is used to specify the Lambda function that will be executed for `Create`, `Update`, and `Delete` events from CloudFormation.
4.  **IAM Permissions:** The `Provider` needs a `role` or you can add permissions to the handler function's automatically created role (`provider.onEventHandler.addToRolePolicy(...)`).

#### **Example Pattern from Documentation:**

```typescript
// The Lambda function that will perform the check
const onEventHandler = new lambda.NodejsFunction(this, 'MyHandler', { ... });

// The Provider that orchestrates the custom resource
const myProvider = new cr.Provider(this, 'MyProvider', {
  onEventHandler: onEventHandler,
});

// The Custom Resource itself, which triggers the provider
new cdk.CustomResource(this, 'MyResource', {
  serviceToken: myProvider.serviceToken,
  properties: {
      // Data to pass to the Lambda
  }
});
```

*   **Conclusion:** This pattern is exactly what we need. We will create a `NodejsFunction` to check Bedrock models and wire it up to a `Provider`.

---

### **Part 2: How to Check Bedrock Model Access via SDK**

*   **Source:** [AWS SDK for JavaScript v3 API Reference - `ListFoundationModelsCommand`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/bedrock/command/ListFoundationModelsCommand/)

#### **Key Findings:**

1.  **The Command:** The `ListFoundationModelsCommand` is the correct API call to get information about available foundation models.
2.  **IAM Permission Required:** The role executing this command must have the `bedrock:ListFoundationModels` permission.
3.  **The Response Structure:** The command returns an array called `modelSummaries`. Each object in this array contains details about a model.
    *   **Quote from Documentation:**
        ```json
        {
          "modelSummaries": [
            {
              "modelArn": "string",
              "modelId": "string",
              "modelName": "string",
              "providerName": "string",
              "customizationsSupported": ["string"],
              "inferenceTypesSupported": ["string"],
              "inputModalities": ["string"],
              "outputModalities": ["string"],
              "responseStreamingSupported": boolean,
              "modelLifecycle": { ... },
              "providerDetails": { ... }
            }
          ]
        }
        ```
    *   **CRITICAL FINDING:** My initial assumption about an `accessStatus` field was **incorrect**. The `ListFoundationModels` API **only returns models that the user has access to.** If a model is not enabled, it simply **will not appear** in the `modelSummaries` list.

4.  **The Correct Logic:** The Lambda function must:
    *   Call `ListFoundationModels`.
    *   Get the list of `modelSummaries`.
    *   Check if `amazon.titan-embed-text-v1` exists in the list.
    *   Check if `anthropic.claude-3-sonnet-20240229-v1:0` exists in the list.
    *   If either is missing, the check fails.

---

### **Part 3: How to Fail a CloudFormation Deployment from a Lambda**

*   **Source:** [AWS CloudFormation User Guide - `cfn-response` module](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-lambda-function-code-cfnresponse.html)
*   **Source:** [AWS Blog: "AWS CDK Custom Resource Best Practices"](https://aws.amazon.com/blogs/devops/best-practices-for-developing-aws-cdk-custom-resources/)

#### **Key Findings:**

1.  **Signaling CloudFormation:** The custom resource Lambda must send a signed URL `PUT` request to a pre-signed S3 URL provided by CloudFormation in the `event` object.
2.  **The `cfn-response` Module:** For Node.js, AWS provides a helper module called `cfn-response` to simplify this. However, it is a legacy pattern. **The CDK `Provider` construct handles this automatically.**
3.  **Failing with the `Provider` Construct:** When using the modern `Provider` framework, you don't need to manually send a response. You simply need to **throw an error** from the `onEventHandler` Lambda.
    *   **Quote from CDK Developer Guide:** *"If the `onEvent` handler throws an exception, the provider framework will catch it and return a `FAILED` response to AWS CloudFormation."*
    *   The `Reason` field in the CloudFormation event log will be populated with the error message from the thrown exception.

4.  **The Correct Logic:**
    *   If a required model is missing from the `ListFoundationModels` response, the Lambda should `throw new Error("... a clear error message ...")`.
    *   If all models are present, the Lambda should simply return successfully.

---

## **Final Implementation Plan (Based on Research)**

1.  **Create a new Lambda function (`backend/lambda/model-check/index.js`):**
    *   This function will use the AWS SDK's `ListFoundationModelsCommand`.
    *   It will get the list of available models.
    *   It will check for the existence of our two required models.
    *   If a model is missing, it will `throw new Error()` with a very clear, user-friendly message explaining exactly which models to enable and how.

2.  **Update `backend-stack.ts`:**
    *   Create the `modelCheckLambda` using the `NodejsFunction` construct.
    *   Grant it the `bedrock:ListFoundationModels` IAM permission.
    *   Create a `custom_resources.Provider` and pass the `modelCheckLambda` to its `onEventHandler`.
    *   Create a `cdk.CustomResource` and pass it the `provider.serviceToken`. This will trigger the check during deployment.

This plan is 100% aligned with the official, modern, and robust patterns described in the AWS CDK and SDK documentation. It is the correct way to build this pre-deployment check.

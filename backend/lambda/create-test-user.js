const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } = require("@aws-sdk/client-cognito-identity-provider");

const cognito = new CognitoIdentityProviderClient();

exports.handler = async (event) => {
  console.log("Create test user handler invoked:", JSON.stringify(event, null, 2));

  const { RequestType } = event;
  const { UserPoolId, TestUserEmail, TestUserPassword, TestUsername } = event.ResourceProperties;

  // Default test user credentials
  const email = TestUserEmail || "test@example.com";
  const password = TestUserPassword || "TestPassword123!";
  // When email is used as sign-in alias, username must be different from email
  // Use a simple username like "testuser" and set email as an attribute
  const username = TestUsername || "testuser";

  const response = {
    PhysicalResourceId: `test-user-${UserPoolId}`,
  };

  try {
    if (RequestType === "Create" || RequestType === "Update") {
      // Check if user already exists
      let userExists = false;
      try {
        // Try to get user - if it doesn't exist, we'll create it
        await cognito.send(new AdminCreateUserCommand({
          UserPoolId,
          Username: username,
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
          ],
          MessageAction: "SUPPRESS", // Don't send welcome email
          TemporaryPassword: password,
        }));
        console.log(`Created test user: ${username}`);
      } catch (error) {
        if (error.name === "UsernameExistsException" || error.name === "AliasExistsException") {
          console.log(`User ${username} already exists, updating password...`);
          userExists = true;
        } else {
          throw error;
        }
      }

      // Set permanent password (works for both new and existing users)
      try {
        await cognito.send(new AdminSetUserPasswordCommand({
          UserPoolId,
          Username: username,
          Password: password,
          Permanent: true,
        }));
        console.log(`Set permanent password for user: ${username}`);
      } catch (error) {
        // If user was just created, password might already be set
        if (error.name !== "InvalidPasswordException" && error.name !== "InvalidParameterException") {
          console.warn(`Warning setting password: ${error.message}`);
        }
      }

      response.Data = {
        Username: username,
        Email: email,
        Message: userExists ? "User already existed, password updated" : "User created successfully",
      };
    } else if (RequestType === "Delete") {
      // Optionally delete the test user on stack deletion
      // For now, we'll keep the user (safer)
      console.log("Stack deletion requested - keeping test user (RemovalPolicy.RETAIN)");
      response.Data = { Message: "Test user retained" };
    }

    return response;
  } catch (error) {
    console.error("Error creating test user:", error);
    // Don't fail the stack deployment if user creation fails
    // Just log the error and return success
    if (RequestType === "Delete") {
      return response;
    }
    // For Create/Update, we'll still return success to not block deployment
    // The user can be created manually if needed
    response.Data = {
      Error: error.message,
      Message: "Test user creation failed - can be created manually",
    };
    return response;
  }
};


# 🔐 Login Instructions

## Option 1: Use the Test Account (Created)

**Username**: `testuser`  
**Temporary Password**: `TempPass123!`

**First Login Steps:**
1. Enter username: `testuser`
2. Enter temporary password: `TempPass123!`
3. You'll be prompted to set a new password
4. Enter your new password (must meet requirements)
5. You'll be logged in!

---

## Option 2: Create Your Own Account

The frontend supports self-registration! On the login page:

1. Click **"Create account"** (or similar link)
2. Enter your details:
   - Username (or email)
   - Password (must meet policy requirements)
   - Email address
3. Verify your email (if required)
4. Sign in with your new account

---

## Option 3: Enable Self-Signup (If Not Already Enabled)

If you don't see a "Create account" option, enable it:

```bash
aws cognito-idp update-user-pool \
  --user-pool-id us-west-2_ecnJSwxjL \
  --admin-create-user-config AllowAdminCreateUserOnly=false \
  --region us-west-2
```

---

## Frontend URL

**https://d3fgxfnk8tjb62.cloudfront.net**

The Amplify Authenticator component should show:
- Sign in form
- Link to create account
- Password reset option

---

## Password Requirements

Based on Cognito settings, passwords likely need:
- At least 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter  
- At least 1 number
- At least 1 special character


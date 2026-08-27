#!/bin/bash
set -e

echo "Creating AWS Secrets Manager secrets for WMAC Admin Web..."

# Check if AWS CLI is configured with wmac profile
if ! aws configure list --profile wmac &> /dev/null; then
  echo "Error: AWS CLI profile 'wmac' not found."
  echo "Please configure it with: aws configure --profile wmac"
  exit 1
fi

REGION="us-east-1"
PROFILE="wmac"

# Admin allowlist secret
echo ""
echo "Creating admin allowlist secret..."
read -p "Enter comma-separated admin emails (e.g., admin@example.com,owner@example.com): " ADMIN_EMAILS

# Convert comma-separated emails to JSON array
IFS=',' read -ra EMAIL_ARRAY <<< "$ADMIN_EMAILS"
JSON_EMAILS=""
for email in "${EMAIL_ARRAY[@]}"; do
  email=$(echo "$email" | xargs) # trim whitespace
  if [ -z "$JSON_EMAILS" ]; then
    JSON_EMAILS="\"$email\""
  else
    JSON_EMAILS="$JSON_EMAILS,\"$email\""
  fi
done

ALLOWLIST_JSON="{\"allowedAdmins\":[$JSON_EMAILS]}"

aws secretsmanager create-secret \
  --name wmac-admin-allowlist \
  --secret-string "$ALLOWLIST_JSON" \
  --profile "$PROFILE" \
  --region "$REGION" \
  2>/dev/null || \
aws secretsmanager update-secret \
  --secret-id wmac-admin-allowlist \
  --secret-string "$ALLOWLIST_JSON" \
  --profile "$PROFILE" \
  --region "$REGION"

echo "✓ Admin allowlist secret created/updated"

# Session signing key
echo ""
echo "Creating session signing key..."
SIGNING_KEY=$(openssl rand -base64 32)
SIGNING_KEY_JSON="{\"signingKey\":\"$SIGNING_KEY\"}"

aws secretsmanager create-secret \
  --name wmac-session-signing-key \
  --secret-string "$SIGNING_KEY_JSON" \
  --profile "$PROFILE" \
  --region "$REGION" \
  2>/dev/null || \
aws secretsmanager update-secret \
  --secret-id wmac-session-signing-key \
  --secret-string "$SIGNING_KEY_JSON" \
  --profile "$PROFILE" \
  --region "$REGION"

echo "✓ Session signing key created/updated"

echo ""
echo "✓ All secrets created successfully!"
echo ""
echo "Next steps:"
echo "  1. cd cloud"
echo "  2. sam build"
echo "  3. sam deploy --profile wmac --region us-east-1"

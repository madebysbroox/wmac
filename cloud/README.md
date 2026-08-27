# WMAC Admin Web App

Secure cloud-hosted admin portal for the WMAC Payment Tracker. This is the first phase of migration from the local Electron app to a multi-admin web application.

## Architecture

See [Cloud Migration Architecture](../docs/cloud-migration-architecture.md) for full details.

**Tech Stack:**
- AWS SAM (Serverless Application Model)
- API Gateway + Lambda (Node.js 20)
- DynamoDB (members, payments, sessions)
- CloudFront + S3 (static assets)
- Secrets Manager (auth secrets)

**Security:**
- ✅ Allowlist-only authentication (no public signup)
- ✅ Magic link email verification
- ✅ HttpOnly Secure cookies
- ✅ Rate-limited login attempts
- ✅ 24-hour session expiry
- ✅ No secrets in frontend

## Prerequisites

- [AWS CLI](https://aws.amazon.com/cli/) configured with profile `wmac`
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Node.js 20+
- AWS account with appropriate permissions

## Setup

### 1. Install Dependencies

```bash
cd cloud
npm install
```

### 2. Create Secrets in AWS Secrets Manager

Using AWS CLI with profile `wmac`:

```bash
# Admin allowlist secret
aws secretsmanager create-secret \
  --name wmac-admin-allowlist \
  --secret-string '{"allowedAdmins":["owner@worldmartialartscenter.com","admin1@example.com"]}' \
  --profile wmac \
  --region us-east-1

# Session signing key (generate a random 256-bit key)
aws secretsmanager create-secret \
  --name wmac-session-signing-key \
  --secret-string '{"signingKey":"'$(openssl rand -base64 32)'"}' \
  --profile wmac \
  --region us-east-1
```

### 3. Build and Deploy

```bash
# Build Lambda functions
sam build

# Deploy to AWS (guided - first time)
sam deploy --guided --profile wmac --region us-east-1

# Deploy to AWS (subsequent deployments)
sam deploy --profile wmac --region us-east-1
```

**Deployment Parameters:**
- Stack Name: `wmac-admin-web`
- Region: `us-east-1`
- Confirm changes before deploy: Y
- Allow SAM CLI IAM role creation: Y
- Save arguments to configuration file: Y

### 4. Upload Web Assets

After deployment, upload static web files to S3:

```bash
aws s3 sync web/src/ s3://$(aws cloudformation describe-stacks \
  --stack-name wmac-admin-web \
  --query 'Stacks[0].Outputs[?OutputKey==`WebAssetsBucket`].OutputValue' \
  --output text \
  --profile wmac \
  --region us-east-1)/ \
  --profile wmac \
  --region us-east-1
```

### 5. Get CloudFront URL

```bash
aws cloudformation describe-stacks \
  --stack-name wmac-admin-web \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' \
  --output text \
  --profile wmac \
  --region us-east-1
```

Visit the CloudFront URL to access the admin portal.

## Development

### Local Testing (Lambda Functions)

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

### Local API (SAM Local)

```bash
# Start local API
sam local start-api --profile wmac --region us-east-1

# Visit http://localhost:3000
```

**Note:** SAM local requires Docker and will pull AWS Lambda runtime images.

## Security Configuration

### Admin Allowlist

To add or remove admins, update the secret:

```bash
aws secretsmanager update-secret \
  --secret-id wmac-admin-allowlist \
  --secret-string '{"allowedAdmins":["email1@example.com","email2@example.com"]}' \
  --profile wmac \
  --region us-east-1
```

Changes take effect immediately (secrets are cached for 5 minutes).

### Session Configuration

Sessions are valid for 24 hours. To invalidate all sessions:

```bash
aws dynamodb scan \
  --table-name $(aws cloudformation describe-stacks \
    --stack-name wmac-admin-web \
    --query 'Stacks[0].Outputs[?OutputKey==`SessionTableName`].OutputValue' \
    --output text \
    --profile wmac \
    --region us-east-1) \
  --projection-expression sessionToken \
  --profile wmac \
  --region us-east-1 \
  | jq -r '.Items[].sessionToken.S' \
  | xargs -I {} aws dynamodb delete-item \
    --table-name <table-name> \
    --key '{"sessionToken":{"S":"{}"}}' \
    --profile wmac \
    --region us-east-1
```

## Phase 1 Scope (This PR)

✅ Infrastructure deployed to AWS us-east-1  
✅ Secure authentication with admin allowlist  
✅ Protected admin home page proving auth works  
✅ Tests for fail-closed auth behavior  
✅ Desktop app remains fully functional  

**Not in scope:**
- Data migration from desktop app
- Member/payment management UI
- Square payment approval queue
- Email service for magic links (logged to CloudWatch for now)

## Deployment Checklist

Before deploying to production:

- [ ] Update admin allowlist with real email addresses
- [ ] Rotate session signing key
- [ ] Configure email service (SES) for magic links
- [ ] Set up CloudWatch alarms for auth failures
- [ ] Review IAM policies and least-privilege access
- [ ] Enable CloudTrail logging
- [ ] Test login flow from production domain
- [ ] Verify CORS headers match CloudFront domain

## Troubleshooting

### Login link not working

Check CloudWatch Logs for the Lambda function:

```bash
sam logs -n LoginFunction --stack-name wmac-admin-web --profile wmac --region us-east-1 --tail
```

### Session not persisting

1. Verify cookies are enabled
2. Check CORS configuration allows credentials
3. Verify CloudFront domain matches CORS allow-origin

### 401 Unauthorized on /api/home

1. Verify session exists in DynamoDB
2. Check authorizer Lambda logs
3. Verify cookie name is `wmac-session`

## Clean Up

To delete the stack:

```bash
# Empty S3 bucket first
aws s3 rm s3://<bucket-name> --recursive --profile wmac --region us-east-1

# Delete stack
sam delete --stack-name wmac-admin-web --profile wmac --region us-east-1
```

## Next Steps (Future PRs)

1. **Email Service**: Integrate SES for magic link delivery
2. **Data Migration**: Export/import tool for desktop → cloud
3. **Member Management**: CRUD UI for members and payments
4. **Square Integration**: Shared approval queue
5. **Reports**: Year-end tax reports, monthly revenue

## Contact

For questions or issues, contact the front office at (540) 347-7266.

# WMAC Cloud Admin Web - Deployment Guide

## Quick Start

1. **Prerequisites**
   - AWS CLI with profile `wmac` configured
   - AWS SAM CLI installed
   - Node.js 20+

2. **Create Secrets**
   ```bash
   ./scripts/setup-secrets.sh
   ```

3. **Deploy**
   ```bash
   sam build
   sam deploy --profile wmac --region us-east-1
   ```

4. **Upload Web Assets**
   ```bash
   ./scripts/deploy-web-assets.sh
   ```

5. **Get Admin URL**
   ```bash
   aws cloudformation describe-stacks \
     --stack-name wmac-admin-web \
     --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' \
     --output text \
     --profile wmac \
     --region us-east-1
   ```

## Testing

```bash
cd cloud
npm install
npm test
```

## Security Notes

- Only allowlisted admin emails can sign in
- Sessions expire after 24 hours
- Login attempts are rate-limited (5 per hour per IP)
- All secrets stored in AWS Secrets Manager
- HTTPS enforced via CloudFront

## Troubleshooting

See [cloud/README.md](./README.md) for detailed troubleshooting steps.

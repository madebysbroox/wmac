#!/bin/bash
set -e

echo "Deploying web assets to S3..."

STACK_NAME="wmac-admin-web"
REGION="us-east-1"
PROFILE="wmac"

# Get S3 bucket name from CloudFormation outputs
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`WebAssetsBucket`].OutputValue' \
  --output text \
  --profile "$PROFILE" \
  --region "$REGION")

if [ -z "$BUCKET_NAME" ]; then
  echo "Error: Could not find S3 bucket. Is the stack deployed?"
  exit 1
fi

echo "Uploading to bucket: $BUCKET_NAME"

# Sync web assets
aws s3 sync web/src/ "s3://$BUCKET_NAME/" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --delete \
  --cache-control "public, max-age=3600"

echo "✓ Web assets deployed successfully"

# Get CloudFront URL
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' \
  --output text \
  --profile "$PROFILE" \
  --region "$REGION")

echo ""
echo "Admin portal URL: $CLOUDFRONT_URL"
echo ""
echo "Note: CloudFront may take 5-10 minutes to propagate changes."

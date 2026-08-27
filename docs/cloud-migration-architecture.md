# Cloud Migration Architecture

## Overview

This document describes the architecture for migrating the WMAC Payment Tracker from a local Electron app to a secure, cloud-hosted admin web application. This is a gradual migration that preserves the existing desktop app while building cloud infrastructure for multi-admin access.

## Current State (Laptop-Only)

- **Desktop App**: Electron app running on Windows laptop
- **Data Storage**: Browser localStorage under key `master-lee-payment-tracker`
- **Square Integration**: Polls AWS relay Lambda at `GET /payments` with bearer token
- **Limitation**: Two-office setup means approvals are local and not shared

## Target Cloud Architecture

### 1. Infrastructure Layout

The web app will deploy to **AWS us-east-1** alongside the existing `wmac-square-webhook-relay` stack:

```
┌─────────────────────────────────────────────────────┐
│                    AWS us-east-1                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────────────┐                       │
│  │ Existing Square Relay    │                       │
│  │ (wmac-square-webhook-    │                       │
│  │       relay stack)       │                       │
│  ├──────────────────────────┤                       │
│  │ • API Gateway            │                       │
│  │ • Lambda (webhook RX)    │                       │
│  │ • DynamoDB (payments)    │                       │
│  │ • Secrets Manager        │                       │
│  └──────────────────────────┘                       │
│              ▲                                       │
│              │ Square webhooks                       │
│              │                                       │
│  ┌──────────────────────────┐                       │
│  │ NEW: Admin Web App       │                       │
│  │ (wmac-admin-web stack)   │                       │
│  ├──────────────────────────┤                       │
│  │ • CloudFront + S3        │   Static web assets   │
│  │ • API Gateway (private)  │   Admin API           │
│  │ • Lambda (auth + API)    │   Business logic      │
│  │ • DynamoDB (members)     │   Member/ledger data  │
│  │ • DynamoDB (sessions)    │   Session tokens      │
│  │ • Secrets Manager        │   Auth secrets        │
│  └──────────────────────────┘                       │
│              ▲                                       │
│              │ HTTPS only                            │
│              │                                       │
└─────────────────────────────────────────────────────┘
               ▲
               │
     ┌─────────┴─────────┐
     │ Allowlisted Admins │
     │ (home computers)   │
     └────────────────────┘
```

### 2. Data Storage Migration

**Phase 1 (This PR)**: Infrastructure only, no data migration
- Web app has empty DynamoDB tables ready
- Desktop app continues to use localStorage
- No cutover, no data loss risk

**Phase 2 (Future)**: Data sync and migration
- Export from desktop → import to cloud
- Cloud becomes source of truth
- Desktop app can become read-only or retired

#### Member & Payment Data (DynamoDB)

**Table: `wmac-members`**
- Partition Key: `memberId` (UUID)
- Attributes: name, email, phone, household, programs, payment history, etc.
- Same schema as current `members` array in localStorage
- GSI on email for login/search
- GSI on householdName for family grouping

**Table: `wmac-payments`**
- Partition Key: `paymentId` (UUID)
- Sort Key: `paidAt` (ISO timestamp)
- Attributes: memberId, month, amount, source, note
- GSI on memberId for member payment history
- Preserves full audit trail

**Table: `wmac-square-staging`**
- Shared queue for Square payment approvals
- Solves the two-office problem: approvals visible to all admins
- Partition Key: `squarePaymentId`
- Attributes: amount, member match, status (pending/approved/ignored)

#### Session Storage (DynamoDB)

**Table: `wmac-admin-sessions`**
- Partition Key: `sessionToken` (secure random 256-bit)
- TTL attribute for automatic cleanup
- Attributes: adminEmail, createdAt, expiresAt, ipAddress
- No sensitive data in session beyond admin identity

### 3. Authentication & Authorization

#### Security Model: Allowlist Only, Fail Closed

**No public access**. Only pre-approved admin emails can sign in.

**Admin Allowlist** (stored in AWS Secrets Manager):
```json
{
  "allowedAdmins": [
    "owner@worldmartialartscenter.com",
    "admin1@example.com",
    "admin2@example.com"
  ]
}
```

#### Authentication Flow

1. **Login Page** (public, but only shows login form)
   - Email + password entry
   - Password is NOT stored; we use magic links or password hash
   - Rate limited: 5 attempts per IP per hour

2. **Email Verification** (magic link pattern)
   - User enters email
   - If email is in allowlist: send magic link to their email
   - If email is NOT in allowlist: generic "check your email" message (no leak)
   - Magic link contains time-limited token (15 min expiry)
   - Clicking link creates session

3. **Session Management**
   - HttpOnly, Secure, SameSite=Strict cookie
   - 256-bit random session token
   - 24-hour session lifetime
   - Sessions stored in DynamoDB with TTL
   - No localStorage for session tokens

4. **API Protection**
   - Every API endpoint (except `/auth/login` and `/auth/verify`) requires valid session
   - Lambda authorizer checks session token against DynamoDB
   - Returns 401 for missing/invalid/expired sessions
   - No `Authorization: Bearer` in client JS (uses cookie)

#### Secrets Management

**DO NOT COMMIT**:
- Admin allowlist
- Session signing keys
- Square access tokens
- Relay sync tokens
- Email service credentials

**USE**:
- AWS Secrets Manager for production secrets
- Environment variables (from Secrets Manager) in Lambda
- Placeholder values in `template.yaml` that reference secrets

### 4. API Design

**Public Endpoints** (no auth required):
- `POST /auth/login` - Send magic link
- `GET /auth/verify?token=...` - Verify magic link, create session
- `POST /auth/logout` - Destroy session

**Protected Endpoints** (require valid session):
- `GET /api/members` - List members (paginated)
- `GET /api/members/:id` - Get member details
- `POST /api/members` - Create member
- `PUT /api/members/:id` - Update member
- `GET /api/payments` - List payments (paginated, filterable)
- `POST /api/payments` - Record payment
- `GET /api/square/staging` - Get pending Square payments
- `POST /api/square/staging/:id/approve` - Approve as tuition
- `POST /api/square/staging/:id/ignore` - Ignore payment

**CORS Policy**:
- Allowed origins: CloudFront distribution domain only (not `*`)
- Credentials: `true` (required for cookies)
- Methods: GET, POST, PUT (no DELETE in phase 1)

### 5. Deployment

#### AWS SAM Template

Using AWS SAM (Serverless Application Model) for consistency with the relay stack:

```yaml
# template.yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Parameters:
  AdminAllowlistSecret:
    Type: String
    Description: ARN of Secrets Manager secret containing admin allowlist
  Environment:
    Type: String
    Default: production
    AllowedValues: [development, production]

Resources:
  # S3 + CloudFront for static assets
  # API Gateway + Lambda for API
  # DynamoDB tables for data
  # Lambda authorizer for session validation
```

#### Deployment Profile

Deploy using AWS profile `wmac` in region `us-east-1`:
```bash
sam build
sam deploy --profile wmac --region us-east-1 --stack-name wmac-admin-web
```

### 6. Security Checklist

- ✅ No public signup
- ✅ Admin allowlist in Secrets Manager
- ✅ Rate-limited login attempts
- ✅ HttpOnly Secure cookies for sessions
- ✅ No secrets in frontend bundle
- ✅ HTTPS only (enforced by CloudFront)
- ✅ CORS restricted to CloudFront domain
- ✅ Session expiry and cleanup (DynamoDB TTL)
- ✅ No logging of PII in CloudWatch
- ✅ Fail-closed: unknown emails cannot sign in

### 7. Bilingual UI (Korean/English)

Preserve the existing i18n approach:
- Reuse `src/i18n.js` patterns
- All UI text shows Korean first, English below
- Large, high-contrast text for readability

### 8. Migration Phases

**Phase 1 (This PR)**: Infrastructure & auth skeleton
- Deploy empty cloud stack
- Prove auth works with allowlist
- Desktop app untouched

**Phase 2 (Future)**: Data migration
- Export tool from desktop
- Import wizard in cloud
- Sync layer for gradual cutover

**Phase 3 (Future)**: Full cutover
- Cloud is source of truth
- Desktop app optional or retired
- Shared Square approval queue

## Open Questions & Future Work

1. **Email Service**: Use SES for magic links? (in scope for later PR)
2. **Password vs Magic Links**: Start with magic links, add password auth later?
3. **Mobile Access**: Does the web app need to be mobile-friendly?
4. **Backup/Export**: Cloud → CSV export for safety?
5. **Desktop Retirement**: When can the laptop app be sunset?

## Non-Goals (Out of Scope)

- Public member portal
- Online payment collection
- Member self-service
- Mobile app (separate project)
- Integration with school website

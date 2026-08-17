# Connecting Square

Square payments enter the WMAC Payment Tracker through **Square Confirmations**. They remain in a separate confirmation queue until someone chooses the member and tuition month, then confirms the payment as tuition or another sale.

## Installed Windows App

**⚠️ Important:** Square payment approvals are stored on the computer where they are confirmed. If you run this app on multiple computers, each one can approve the same payment onto separate ledgers. Designate one machine as the approval authority.

1. Open **Square Confirmations**.
2. Expand **Square connection settings**.
3. Enter the relay HTTPS URL and limited-scope sync token.
4. Save the connection.
5. Click **Sync Square**.

The Electron main process performs the network request. The page does not receive the relay token or a direct Square access token. Settings and staged payments are saved beneath the current Windows user's Electron app-data directory.

The integration enforces two safeguards:

- Only `COMPLETED` Square payments can enter or be confirmed from the queue.
- Direct Square API sync follows pagination for up to 2,000 recent results instead of stopping at the first 100.

## Recommended: Square Relay

Set:

```bash
SQUARE_RELAY_BASE_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com
SQUARE_RELAY_SYNC_TOKEN=replace-with-the-same-long-token-used-during-relay-deploy
```

Then start the app:

```bash
SQUARE_RELAY_BASE_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com \
SQUARE_RELAY_SYNC_TOKEN=your-long-local-sync-token \
npm start
```

The relay must expose:

- `GET /payments`, returning JSON with a `payments` array and optional `nextCursor` for pagination.
- `POST /payments/:paymentId/delivered`, accepting `{"eventId":"SQUARE_EVENT_ID"}`.
- Optionally, `POST /subscriptions/monthly-invoice` for monthly Square payment links.

Each relay payment should include:
- `paymentId` or `squarePaymentId` — the Square payment identifier
- `eventId` or `event_id` — the Square webhook event identifier
- `status` or `squareStatus` — payment status (must be `COMPLETED` to import)
- `amountCents` — payment amount in cents
- `buyerEmail` or `buyerEmailAddress` — payer email address
- `squareCreatedAt` or `createdAt` — when the payment was created
- Optional fields: `buyerName`, `receiptUrl`, `receivedAt`, `localStatus`

## Optional: Direct Square Sync

Use direct sync only if the office computer can safely hold a Square access token:

```bash
SQUARE_ACCESS_TOKEN=your-square-access-token \
SQUARE_ENVIRONMENT=production \
SQUARE_LOCATION_ID=optional-square-location-id \
npm start
```

- Set `SQUARE_ENVIRONMENT=sandbox` to use Square's sandbox.
- `SQUARE_LOCATION_ID` is recommended when the Square account has multiple locations.
- `SQUARE_API_VERSION` is optional.

## Monthly Square Payment Links

The payer-only monthly invoice action creates a Square Subscription without storing a card. Square emails the payer a monthly payment link.

Set:

```bash
SQUARE_LOCATION_ID=your-square-location-id
SQUARE_MONTHLY_INVOICE_PLAN_VARIATION_ID=your-monthly-static-price-plan-variation-id
```

The plan variation must use monthly cadence and static pricing. The app supplies the household tuition total and contract billing schedule.

## Local Webhook Testing

The local server accepts:

```text
POST /api/square/webhook
```

Set:

```bash
SQUARE_WEBHOOK_SIGNATURE_KEY=your-square-webhook-signature-key
SQUARE_WEBHOOK_NOTIFICATION_URL=https://your-public-url.example.com/api/square/webhook
```

Square requires a public HTTPS notification URL, so regular use should prefer the relay.

## Confirming Payments

1. Open **Square Confirmations**.
2. Sync Square.
3. Choose a payment.
4. Confirm or change the member.
5. Confirm the tuition month.
6. Optionally add a note.
7. Choose:
   - **Confirm tuition** to mark that tuition month paid.
   - **Confirm as other sale** to record revenue without marking tuition paid.
   - **Ignore** to keep the payment out of member records.

Confirmed and ignored Square payments are not applied twice during later syncs.

## Security

- Do not commit production access or relay tokens.
- Prefer limited-scope relay tokens.
- Keep direct Square credentials outside `.env.example`.

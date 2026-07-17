# Connecting Square and World Bankcard

This guide explains how to connect Square and World Bankcard card payments to the WMAC Payment Tracker.

The app does not automatically add card payments to a member's account. Square and World Bankcard payments first appear in **카드 결제 (Card Payments)** as a review queue. A person then chooses the member, payment month, and whether the payment is monthly tuition or another sale.

## How The Connection Works

The app supports two connection styles:

1. **Relay connection**: a cloud service receives provider events and the local app pulls them into the review queue.
2. **Direct sync connection**: the local app calls a provider/export API when someone clicks the sync button.

The relay approach is preferred when a payment provider needs to send webhooks, because the local app usually runs on a private office computer and does not have a public HTTPS address.

Local staged payments are saved in:

- `data/square-payments.json`
- `data/worldbankcard-payments.json`

Those files are intentionally ignored by Git.

## Square

### Installed Windows App

The installed app no longer depends on the development web server for Square synchronization:

1. Open **카드 결제 (Card Payments)**.
2. Expand **Square 연결 설정 (Square Connection Setup)**.
3. Enter the relay's HTTPS base URL and limited-scope sync token.
4. Click **Square 연결 저장 (Save Square Connection)**.
5. Click **스퀘어에서 가져오기 (Sync Square)**.

The Electron main process makes the relay/API request. The page itself never receives the relay token or a Square access token. Provider settings and staged payments are stored beneath the current Windows user's Electron app-data directory.

Square imports enforce two safeguards:

- Only `COMPLETED` payments can enter or be approved from the review queue. Authorized, pending, canceled, and failed payments do not mark tuition paid.
- Direct Square API fallback follows pagination for up to 2,000 recent results per sync instead of silently stopping at the first 100.

When a direct API payment contains a Square customer ID, the app can retrieve that customer's name, email, and phone for matching when the token has `CUSTOMERS_READ`. The strongest match is the dedicated **Square Customer ID** stored on the WMAC person record.

### Recommended: Square Relay

Use this option when Square is configured to send webhooks to a public cloud endpoint.

The local app expects these environment variables:

```bash
SQUARE_RELAY_BASE_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com
SQUARE_RELAY_SYNC_TOKEN=replace-with-the-same-long-token-used-during-relay-deploy
```

Start the app with those values:

```bash
SQUARE_RELAY_BASE_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com \
SQUARE_RELAY_SYNC_TOKEN=your-long-local-sync-token \
npm start
```

Then open the app and click **스퀘어에서 가져오기 (Sync Square)** in **카드 결제 (Card Payments)**.

The relay must expose:

- `GET /payments`, returning JSON with a `payments` array.
- `POST /payments/:paymentId/delivered`, so the app can tell the relay that a payment was copied locally. The app sends `{"eventId":"SQUARE_EVENT_ID"}` as JSON; the relay returns `409 Conflict` instead of clearing the record if a newer Square event arrived after the fetch.

Each relay payment must include its Square `eventId` and can include fields such as `paymentId`, `squarePaymentId`, `amount`, `buyerName`, `buyerEmailAddress`, `receiptUrl`, `squareCreatedAt`, `receivedAt`, and `localStatus`. The app normalizes these fields before showing the payment in the review queue.

### Optional: Direct Square Sync

Use this option only if the office computer can safely hold a Square access token.

```bash
SQUARE_ACCESS_TOKEN=your-square-access-token \
SQUARE_ENVIRONMENT=production \
SQUARE_LOCATION_ID=optional-square-location-id \
npm start
```

Notes:

- `SQUARE_ENVIRONMENT=sandbox` makes the app call Square's sandbox API.
- `SQUARE_LOCATION_ID` is optional, but recommended if the Square account has more than one location.
- `SQUARE_API_VERSION` is optional. If omitted, the app uses its built-in Square API version.

When someone clicks **스퀘어에서 가져오기 (Sync Square)**, the app calls Square's payments endpoint, imports up to 100 recent payments, and stages them for review.

### Local Webhook Testing

For local Square webhook testing, the app also has a webhook endpoint:

```text
POST /api/square/webhook
```

Set:

```bash
SQUARE_WEBHOOK_SIGNATURE_KEY=your-square-webhook-signature-key
SQUARE_WEBHOOK_NOTIFICATION_URL=https://your-public-url.example.com/api/square/webhook
```

Square requires a public HTTPS notification URL, so this is normally useful only with a tunnel or separate relay. For regular use, prefer the relay connection.

## World Bankcard

World Bankcard's public site mentions online payment features such as API website integration and developer/POS integration, but this repo does not have public World Bankcard endpoint, authentication, or webhook documentation yet. Until World Bankcard provides those details, the app implements a safe generic JSON import path and keeps provider payments in the manual review queue.

The app does not include a built-in World Bankcard webhook receiver. It expects either a relay or a JSON transaction export endpoint.

### Recommended: World Bankcard Relay

Use this option when World Bankcard can send payments to a cloud bridge or when a custom bridge is needed.

```bash
WORLDBANKCARD_RELAY_BASE_URL=https://YOUR_WORLDBANKCARD_RELAY.example.com
WORLDBANKCARD_RELAY_SYNC_TOKEN=replace-with-a-long-local-sync-token
```

Start the app:

```bash
WORLDBANKCARD_RELAY_BASE_URL=https://YOUR_WORLDBANKCARD_RELAY.example.com \
WORLDBANKCARD_RELAY_SYNC_TOKEN=your-long-local-sync-token \
npm start
```

Then click **World Bankcard에서 가져오기 (Sync World Bankcard)** in **카드 결제 (Card Payments)**.

The relay must expose:

- `GET /payments`, returning either an array of payments or an object containing one of these array keys: `payments`, `transactions`, `items`, `data`, or `results`.
- Optional but recommended: `POST /payments/:paymentId/delivered`, so the app can tell the relay that a payment was copied locally. If this endpoint is missing, the local copy is still saved.

The app sends the relay token as:

```text
Authorization: Bearer YOUR_TOKEN
```

### Optional: Direct World Bankcard Export Sync

Use this option if World Bankcard, or a reporting service connected to World Bankcard, provides a JSON transaction export endpoint.

```bash
WORLDBANKCARD_TRANSACTIONS_URL=https://YOUR_WORLDBANKCARD_EXPORT_ENDPOINT
WORLDBANKCARD_ACCESS_TOKEN=your-bearer-token
npm start
```

If World Bankcard provides an API-key header instead:

```bash
WORLDBANKCARD_TRANSACTIONS_URL=https://YOUR_WORLDBANKCARD_EXPORT_ENDPOINT
WORLDBANKCARD_API_KEY=your-api-key
WORLDBANKCARD_API_KEY_HEADER=x-api-key
npm start
```

If the endpoint uses basic authentication instead:

```bash
WORLDBANKCARD_TRANSACTIONS_URL=https://YOUR_WORLDBANKCARD_EXPORT_ENDPOINT
WORLDBANKCARD_BASIC_AUTH=username:password
npm start
```

Optional:

```bash
WORLDBANKCARD_ACCEPT=application/json
```

The direct endpoint must return JSON. The app accepts:

- A raw array of payments.
- An object with `payments`, `transactions`, `items`, `data`, or `results`.
- A single payment object.

Useful payment fields include `transactionId`, `paymentId`, `amount`, `transactionDate`, `customerName`, `customerEmail`, `customerPhone`, `terminalId`, `batchId`, `receiptNumber`, and `status`.

## Reviewing Imported Payments

After Square or World Bankcard payments are synced:

1. Open **카드 결제 (Card Payments)**.
2. Select a pending payment.
3. Confirm or change the matched member.
4. Confirm the payment month, or use **다음 미납 월 (Next Owed Month)**.
5. Add a review note if needed, such as `gear`, `testing`, or `special payment`.
6. Choose:
   - **회비 승인 (Tuition)** to mark the member's tuition paid for that month.
   - **기타 매출 (Other Sale)** to count the payment as revenue without marking tuition paid.
   - **무시 (Ignore)** to keep the provider payment out of member records.

Approved and ignored provider payments are not applied twice on later syncs.

## Security Notes

- Do not commit real access tokens, relay tokens, or World Bankcard credentials.
- Keep production values outside `.env.example`.
- Prefer relay tokens with limited scope: they only need to let this app fetch staged payments.
- If using direct Square or World Bankcard sync, the office computer running the app can access those provider credentials.

## Troubleshooting

If **Sync Square** or **Sync World Bankcard** says the provider is not configured:

- Confirm the app was started with the required environment variables.
- Stop and restart `npm start` after changing environment variables.
- Check that relay URLs do not end with an extra path unless the relay is designed that way.

If sync runs but no payments appear:

- Confirm the relay/export endpoint returns JSON.
- Confirm the JSON contains payments in one of the supported array fields.
- Confirm payments have an amount and a date-like field.
- Check whether the payments were already approved or ignored.

If member matching is wrong:

- Add or correct member email and phone numbers in the member list.
- Select the correct member manually during review.
- Use the review note field for payments that are not monthly tuition.

# 회비 관리 · Master Lee Payment Tracker

A simple, bilingual (한국어 / English) payment tracker for a martial arts gym owner. It runs locally, saves data in the browser, imports member CSV files, records monthly payments, and exports a backup CSV.

Every button and label shows Korean first with English underneath, so the app can be used comfortably in either language. Text is large and high-contrast for easy reading.

## Setup

Install Node.js 20 or newer if it is not already installed.

Start the app:

```bash
npm start
```

Then open:

```text
http://localhost:4173
```

On Windows, Master Lee can double-click `start-windows.bat` after Node.js is installed — it opens the browser automatically. **For the complete Windows walkthrough (installing Node.js, desktop shortcut, backups, troubleshooting), see [README-windows.md](README-windows.md).**

## Daily Use

The everyday workflow needs only the left side of the screen:

1. **회원 찾기 (Find a Member)** — type a few letters of a name, then click the member. Each member shows a colored dot: green 완납 (paid), orange 확인 필요 (needs attention), red 미납 (behind).
2. On the member page, click the big green **이번 달 납부 완료 (Mark This Month Paid)** button. One click records this month's payment at the member's normal amount.
3. For a different month or amount, use **다른 달 회비 입력 (Record a Different Month)** below it.
4. **＋ 새 회원 추가 (Add New Member)** creates a new member and jumps straight to the name field.
5. For a member who is behind, **알림 이메일 쓰기 (Email Reminder)** opens the computer's own mail program (such as Outlook) with a polite English payment reminder already written — recipient, subject, unpaid months, and total due all filled in. Just click Send. Each month's payment is due on the same day of the month as the member's signing date (clamped for short months); payments 10 or more days past due include a one-time late fee of 5% or $5, whichever is greater, with a footnote explaining it. When 2 or more months are behind, the email adds a note that accounts 3+ months behind may go to a collection agency — while urging a phone call to Master Lee at (540) 347-7266 to work things out first. The button explains itself if the member has no email on file or no balance due.

The home screen (처음 화면) shows who is paid, who needs attention, and who is behind — click any card to see that list of members.

## Square Payment Review · 스퀘어 결제 확인

The **스퀘어 (Square)** tab is a manual staging area for payments reported by Square. Square-reported payments stay separate from member payment history until someone reviews and approves them.

- Pending Square payments show the amount, date, receipt details, suggested member match, and payment month.
- If the suggested match is wrong or missing, choose the correct member before approving.
- **승인 (Approve)** records that payment in the normal member payment history and marks the Square item approved, so it is not applied twice.
- **무시 (Ignore)** keeps the Square item out of member records.
- Members with a staged Square payment show a short **대기 (Pending)** status until the payment is approved or ignored.

Square authentication is intentionally separate from the daily workflow. For the recommended AWS relay, start the local server with:

```bash
SQUARE_RELAY_BASE_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com \
SQUARE_RELAY_SYNC_TOKEN=your-long-local-sync-token \
npm start
```

Then use **스퀘어에서 가져오기 (Sync Square)** to pull pending relay payments into the local review screen.

Optional direct Square API sync is still available if needed:

```bash
SQUARE_ACCESS_TOKEN=... npm start
```

Optional local webhook testing settings:

```bash
SQUARE_WEBHOOK_SIGNATURE_KEY=...
SQUARE_WEBHOOK_NOTIFICATION_URL=https://your-public-url.example.com/api/square/webhook
```

Square requires a public HTTPS webhook URL. The recommended setup is the separate `wmac-square-webhook-relay` AWS project, which receives Square webhooks and lets this local app securely pull staged payments. The local app stores staged payment data in `data/square-payments.json`, which is ignored by Git so the review copy stays local.

## Files & Backup · 파일 · 백업

These less-frequent actions live at the bottom of the left sidebar:

- **회원 명단 가져오기 (Import Members CSV)** — load a member spreadsheet. The app guesses which columns match; `이름 (Member name)` is required. Re-importing an updated spreadsheet is safe: existing members are matched by ID, email, phone, or name, new details fill in the blanks (a blank cell never erases anything), only new people are added, and payment history is untouched.
- **결제 내역 가져오기 (Import Payments CSV)** — load a Square-style payment export. Payments are matched to members by ID, email, phone, or exact name, and months already recorded are skipped — importing the same file twice never doubles a payment. This keeps the future Square import path separate from the member import flow.

Both import dialogs show a reassuring note explaining these rules before anything happens, and the confirmation message reports exactly what was added, updated, and skipped.
- **백업 파일 저장 (Export Backup CSV)** — save a backup of all members and payments.
- **연말 보고서 (Year-End Tax Report)** — pick a year (last year or this year) and get a printable report with total revenue, revenue by month, and revenue by member. Totals are grouped by the month each payment was for.
- **새해 회원 명단 저장 (New Year Roster CSV)** — download a clean CSV of active members (no payment history, inactive members left out), named for the coming year and ready to re-import as a fresh start.

In the installed desktop app, **앱 업데이트 (App Updates)** stays at the bottom of the main left sidebar so it is available from Home, Members, or Square.

The app saves the working data in the browser on the same computer, so the member CSV does not need to be imported again every time.

## Code Layout

- `index.html` — page structure with bilingual labels baked in
- `src/app.js` — UI state, rendering, and actions
- `src/data.js` — pure data logic: CSV parsing, import matching, payment status (fully unit-tested)
- `src/i18n.js` — every user-facing Korean/English string in one place
- `src/styles.css` — large-type, high-contrast styling
- `server.mjs` — tiny static file server

## Local Testing

Sample files are in `samples/`:

```text
samples/members.csv
samples/payments.csv
```

Run tests:

```bash
npm test
```

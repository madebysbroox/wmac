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

On Windows, Master Lee can double-click `start-windows.bat` after Node.js is installed.

## Daily Use

The everyday workflow needs only the left side of the screen:

1. **회원 찾기 (Find a Member)** — type a few letters of a name, then click the member. Each member shows a colored dot: green 완납 (paid), orange 확인 필요 (needs attention), red 미납 (behind).
2. On the member page, click the big green **이번 달 납부 완료 (Mark This Month Paid)** button. One click records this month's payment at the member's normal amount.
3. For a different month or amount, use **다른 달 회비 입력 (Record a Different Month)** below it.
4. **＋ 새 회원 추가 (Add New Member)** creates a new member and jumps straight to the name field.
5. For a member who is behind, **알림 이메일 쓰기 (Email Reminder)** opens the computer's own mail program (such as Outlook) with a polite bilingual reminder already written — recipient, subject, unpaid months, and total due all filled in. Just click Send. The button explains itself if the member has no email on file or no balance due.

The home screen (처음 화면) shows who is paid, who needs attention, and who is behind — click any card to see that list of members.

## Files & Backup · 파일 · 백업

These less-frequent actions live at the bottom of the left sidebar:

- **회원 명단 가져오기 (Import Members CSV)** — load a member spreadsheet. The app guesses which columns match; `이름 (Member name)` is required.
- **결제 내역 가져오기 (Import Payments CSV)** — load a Square-style payment export. Payments are matched to members by ID, email, phone, or exact name. This keeps the future Square import path separate from the member import flow.
- **백업 파일 저장 (Export Backup CSV)** — save a backup of all members and payments.
- **연말 보고서 (Year-End Tax Report)** — pick a year (last year or this year) and get a printable report with total revenue, revenue by month, and revenue by member. Totals are grouped by the month each payment was for.
- **새해 회원 명단 저장 (New Year Roster CSV)** — download a clean CSV of active members (no payment history, inactive members left out), named for the coming year and ready to re-import as a fresh start.

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

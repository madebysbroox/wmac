# Master Lee Payment Tracker

A simple local payment tracker for a martial arts gym owner. It runs on the computer, saves data in the browser, imports member CSV files, records monthly payments, and exports a backup CSV.

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

1. Click `Import Members` and choose a member CSV.
2. Confirm the column matches. `Member name` is required.
3. Type part of a member name in `Find a member`.
4. Click the member.
5. Confirm the payment month and amount.
6. Click `Save Payment`.
7. Click `Export Backup` when a backup CSV is needed.

The app saves the working data in the browser on the same computer, so the member CSV does not need to be imported again every time.

## Payment CSV Imports

`Import Payments` accepts a second CSV for Square-style monthly exports. The code is structured to match payments by member ID, email, phone, or exact name. This keeps the future Square import path separate from the member import flow.

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

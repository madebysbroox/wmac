# Goal Prompt: Master Lee Member Payment Tracker

Create a goal: Build a simple Windows-friendly member payment tracker app for an elderly martial arts gym owner, "Master Lee," who is not computer savvy and types slowly.

## Context

Master Lee currently has a CSV spreadsheet of members. The CSV may include columns like member name, contract start date, monthly payment amount, email, phone, parent/guardian name, and maybe an ID number. The app should let him load this CSV, search members easily, view payment status clearly, and enter payments with as little typing as possible.

## Primary User

An 80-year-old martial arts gym owner using a Windows machine. The app must be extremely simple, readable, forgiving, and optimized for slow one-finger typing. Avoid technical language and clutter.

## Core Product Requirements

- Build a local app that can run on Windows.
- Let the user import/load a CSV of members.
- Show members in a clean, readable interface.
- Provide very easy member search:
  - As the user types, show matching names immediately.
  - Example: typing "S" should show selectable matches like "Sam...", "Sarah...", etc.
  - Selecting a member should require minimal effort.
- Show payment status with calm, useful color coding:
  - Green for paid/up-to-date.
  - Yellow/orange for slightly behind.
  - Red for significantly behind.
  - Avoid obnoxious colors or visual noise.
- Show payment history by year and month.
  - If a member is fully paid up, show the most recent month prominently in green.
  - If a member is behind, show the relevant recent months, such as the last 4 months, so Master Lee can quickly see when they last paid.
- Make entering a payment extremely easy:
  - Select/search a member.
  - Choose or confirm the payment month.
  - Confirm amount, defaulting to the member's normal monthly amount.
  - Save with one obvious button.
  - Avoid requiring repeated typing.
- Support basic data editing:
  - Add a new member.
  - Edit member phone/email/parent/payment amount.
  - Mark a member inactive if needed, without deleting history.
- Persist data locally after import so Master Lee does not need to re-import every time.
- Allow exporting the current member/payment data back to CSV for backup.

## Future-Facing Requirement

Design the data model and import flow so that later it can accept payment data from Square subscriptions or a monthly Square export. Do not need to integrate Square's API now unless it is simple and appropriate. For now, include a second import path or clearly structured code that can ingest a payment export CSV and match payments to members by name, email, phone, or ID where possible.

## UX Requirements

- Use large readable text.
- Use high-contrast but calm colors.
- Use obvious buttons with plain labels.
- Avoid dense spreadsheet-like editing as the main workflow.
- Prefer guided forms, dropdowns, autocomplete, and single-click actions.
- Make dangerous actions hard to do accidentally.
- Include clear empty states and error messages in plain English.
- Assume the CSV columns may not be perfectly named; provide a friendly column-mapping step if practical.

## Engineering Requirements

- Inspect the existing repo first and use its current framework/patterns if there is already an app structure.
- If there is no suitable existing app, choose a pragmatic local-app approach that works well on Windows.
- At the beginning of the goal, identify all likely dependencies and setup commands needed for implementation, testing, packaging, and local preview.
- Front-load dependency work before deep implementation:
  - Check whether dependencies are already installed.
  - If installs are needed, request approval immediately with reusable prefix rules where appropriate, so the rest of the work can continue unattended.
  - Prefer getting package manager installs, browser/test tooling installs, and build tooling setup done early rather than discovering missing dependencies late.
  - After dependencies are installed, run a quick smoke command such as install verification, test discovery, or a dev server startup check before continuing.
- Keep implementation focused and usable rather than over-engineered.
- Add tests where useful, especially for CSV import, payment status calculation, and payment matching logic.
- Include sample CSV data for local testing.
- Include clear run/build instructions in the repo.
- If a dev server or local app preview is needed, start it and provide the URL.
- Verify the main workflow manually: import CSV, search member, record payment, view status, export data.
- Do not push to GitHub or open a PR unless explicitly asked.
- Do not make destructive git changes.
- If network access, dependency installation, or privileged commands are needed, request approval.

## Success Criteria

- A non-technical user can import a member CSV and see a useful member list.
- The app clearly shows who is paid up and who is behind.
- Searching for a member works with partial typing and selectable suggestions.
- Recording a payment takes only a few obvious steps.
- Payment status by month/year is visible and understandable.
- Data persists locally.
- Data can be exported to CSV.
- The code is organized so a future Square CSV/API payment import can be added without rewriting the app.
- Tests/build pass, or any failures are clearly explained.
- Keep working until the app is complete or genuinely blocked.

## Suggested MVP Priority

1. CSV import with friendly column mapping.
2. Member search with autocomplete.
3. Member detail and payment entry screen.
4. Payment status dashboard.
5. Local persistence.
6. CSV export.
7. Future Square import-ready data model.

Important UX principle: do not make Master Lee edit a spreadsheet. The CSV should be an import/export format, but the daily app should feel like: search name, click member, click paid, done.

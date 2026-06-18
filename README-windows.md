# Setting Up the Payment Tracker on a Windows Computer

This guide walks through the recommended desktop app setup for 회비 관리 (Payment Tracker). The goal is simple daily use: double-click one desktop icon and work in a normal app window, with no black command window and no `localhost` address.

## How it works (the short version)

The app runs **entirely on this one computer**. Nothing is uploaded anywhere, no account or internet connection is needed for daily use, and all member and payment data stays on the machine.

Daily use after setup is one step: **double-click the Payment Tracker icon.**

---

## Recommended One-Time Setup

### Step 1 — Install the desktop app

1. Download the newest **Payment Tracker Setup** installer.
2. Open the installer.
3. If Windows shows **Windows protected your PC**, click **More info**, then **Run anyway**.
4. Click through the installer using the defaults.
5. After install, use the **Payment Tracker** desktop icon.

That is the whole setup. Node.js is not needed for the desktop app.

### Step 2 — Load the member list

1. In the app's left sidebar, scroll to **파일 · 백업 (Files & Backup)**.
2. Click **회원 명단 가져오기 (Import Members CSV)** and choose the member spreadsheet saved as a `.csv` file.
3. Check that the columns matched up (the app guesses automatically) and click **가져오기 · Import**.

This only needs to happen once. The data is saved on the computer afterward.

---

## Daily Use

1. Double-click the **Payment Tracker** desktop icon.
2. Search for a member.
3. Click the big paid button or open the invoice/email review.
4. Close the app window when done.

## Updates

Use **파일 · 백업 (Files & Backup)** → **앱 업데이트 (App Updates)** → **업데이트 확인 (Check for Updates)**.

If an update is available, the app downloads it from the public GitHub release. When the download is ready, click **재시작 후 설치 (Restart and Install)**.

The first version that adds in-app updates must still be installed with the downloaded installer. After that, future updates can be pulled from inside the app.

## Invoice and Email Review

When a member has unpaid months:

- Click **청구서 만들기 (Generate Invoice)** or **알림 이메일 쓰기 (Email Reminder)**.
- Check only the unpaid months that should be included.
- Edit the email wording if needed.
- Click **이 문구 저장 (Save Wording)** to make that email wording the new default.
- Generate the invoice or open the email.

---

## Important Things to Know

- **Use the same Windows account.** The data is saved for the Windows user who runs the app.
- **Make backups.** Click **백업 파일 저장 (Export Backup CSV)** once in a while and keep the file in Documents or on a USB stick.
- **No internet needed for daily use.** The installer is downloaded once; the app itself works offline.

## If Something Goes Wrong

| Problem | Fix |
| --- | --- |
| Windows says the app is from an unknown publisher | Click **More info** → **Run anyway**. This appears because the app is not code-signed yet. |
| The app opens but shows no members | Import the most recent backup CSV. |
| Email does not open | Make sure Outlook or another default email app is set up in Windows. |
| Something looks stuck | Close the app and open it again from the desktop icon. |

---

## Developer Fallback

The old Node/browser launcher still exists for development and emergency fallback:

1. Install Node.js from **https://nodejs.org**.
2. Extract the repository folder somewhere permanent.
3. Double-click `start-windows.bat`.

This fallback is not recommended for daily use anymore because it depends on a browser, a local port, and a command window.

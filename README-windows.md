# Setting Up the Payment Tracker on a Windows Computer

This guide walks through everything needed to run the 회비 관리 (Payment Tracker) on a Windows machine, written so a family member or helper can do the whole setup in about 10 minutes.

## How it works (the short version)

The app runs **entirely on this one computer**. A small program (Node.js) shows the app inside the normal web browser, like a private website that only this computer can see. Nothing is uploaded anywhere, no account or internet connection is needed for daily use, and all member and payment data stays on the machine.

Daily use after setup is one step: **double-click the app icon, and the browser opens by itself.**

---

## One-Time Setup

### Step 1 — Install Node.js (the engine)

1. Open a web browser and go to **https://nodejs.org**
2. Click the big green **LTS** download button (the "recommended for most users" version).
3. Open the downloaded file (`node-v__-x64.msi`).
4. Click **Next** through every screen, accepting the defaults, then **Install**, then **Finish**. No checkboxes need to be changed.
5. If Windows asks "Do you want to allow this app to make changes?" click **Yes**.

### Step 2 — Put the app folder on the computer

Get the `wmac` folder onto the computer in whichever way is easiest:

- **From GitHub:** on the repository page click the green **Code** button → **Download ZIP**. Then right-click the downloaded ZIP → **Extract All...** → extract it somewhere permanent, such as `Documents`.
- **From a USB stick:** copy the whole `wmac` folder into `Documents`.

The folder must contain `start-windows.bat`, `index.html`, `server.mjs`, and a `src` folder. Don't move files out of the folder — keep it together.

### Step 3 — Start it for the first time

1. Open the `wmac` folder and **double-click `start-windows.bat`**.
2. Windows may show a blue box that says **"Windows protected your PC"**. Click **More info**, then **Run anyway**. (This appears for any program Windows hasn't seen before; it only asks once.)
3. A black window opens, and a couple of seconds later the web browser opens to the app at `http://localhost:4173`.
4. If Windows Firewall asks for permission for Node.js, either choice is fine — the app only talks to this computer. Click **Allow** to dismiss it.

That's it. The app is running.

### Step 4 — Make a desktop icon (recommended)

So Master Lee never has to find the folder again:

1. Right-click `start-windows.bat` → **Show more options** (on Windows 11) → **Send to** → **Desktop (create shortcut)**.
2. On the desktop, right-click the new shortcut → **Rename** → type **회비 관리** (or "Payment Tracker").

From now on, double-clicking that desktop icon starts everything.

### Step 5 — Load the member list

1. In the app's left sidebar, scroll to **파일 · 백업 (Files & Backup)**.
2. Click **회원 명단 가져오기 (Import Members CSV)** and choose the member spreadsheet (saved as a `.csv` file).
3. Check that the columns matched up (the app guesses automatically) and click **가져오기 · Import**.

This only needs to happen once — the data is saved on the computer afterward.

---

## Daily Use

1. Double-click the **회비 관리** desktop icon.
2. The black window opens (leave it open — minimize it if it's in the way) and the browser opens the app.
3. When done for the day, close the browser tab and the black window.

## Important Things to Know

- **The black window is the app's engine.** If it is closed, the page in the browser stops working. Just double-click the icon again.
- **Always use the same browser.** The data is saved inside the browser (Edge or Chrome — whichever opened the first time). Switching browsers later makes the app look empty; if that's ever needed, use **백업 파일 저장 (Export Backup CSV)** in the old browser and import it in the new one.
- **Don't "clear browsing data" for this app.** Clearing the browser's site data deletes the saved members and payments. If someone helps clean up the computer, tell them to leave `localhost` data alone.
- **Make backups.** Click **백업 파일 저장 (Export Backup CSV)** once in a while and keep the file in `Documents` or on a USB stick. If anything ever goes wrong, the backup can be re-imported safely.
- **No internet needed.** After Node.js is installed, everything works offline. The app never sends data anywhere.

## If Something Goes Wrong

| Problem | Fix |
| --- | --- |
| Double-clicking shows "Node.js is not installed yet" | Do Step 1, then try again. If it still appears, restart the computer once. |
| The browser shows "This site can't be reached" | The black window probably closed. Double-click the desktop icon again, wait a few seconds, then click the browser's reload button. |
| The black window flashes open and closes instantly | Right-click `start-windows.bat` → **Edit** is not needed; instead make sure the file is still inside the `wmac` folder next to `server.mjs`. If the folder was moved, move the shortcut target too (easiest: delete the shortcut and redo Step 4). |
| "Windows protected your PC" appears | Click **More info** → **Run anyway**. It is the app's own start file. |
| The app opens but shows no members | The browser that opened is not the one used before, or browsing data was cleared. Import the most recent backup CSV. |
| Something looks stuck | Close the black window and the browser tab, then double-click the icon again. Restarting never loses saved data. |

## Updating the App Later

If a newer version of the `wmac` folder arrives: export a backup first (just in case), close the app, replace the old folder with the new one, and double-click `start-windows.bat`. The saved data lives in the browser, not the folder, so replacing the folder does not erase members or payments.

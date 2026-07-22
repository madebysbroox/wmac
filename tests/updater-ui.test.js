import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);

test("simplified desktop UI exposes the complete update flow", async () => {
  const [html, renderer, preload, main] = await Promise.all([
    readFile(new URL("index.html", projectRoot), "utf8"),
    readFile(new URL("src/simple.js", projectRoot), "utf8"),
    readFile(new URL("electron/preload.cjs", projectRoot), "utf8"),
    readFile(new URL("electron/main.cjs", projectRoot), "utf8")
  ]);

  assert.match(html, /id="checkUpdateButton"/);
  assert.match(html, /id="installUpdateButton"/);
  assert.match(renderer, /paymentTrackerUpdates\.check\(\)/);
  assert.match(renderer, /paymentTrackerUpdates\.install\(\)/);
  assert.match(renderer, /updateStatus\.status !== "ready"/);
  assert.match(preload, /ipcRenderer\.invoke\("updates:check"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("updates:install"\)/);
  assert.match(main, /autoUpdater\.downloadUpdate\(\)/);
  assert.match(main, /autoUpdater\.quitAndInstall\(false, true\)/);
});

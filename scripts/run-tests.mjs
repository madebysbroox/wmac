import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = fileURLToPath(new URL("../tests/", import.meta.url));
const entries = await readdir(testDir);
const testFiles = entries
  .filter((entry) => entry.endsWith(".test.js"))
  .sort()
  .map((entry) => join(testDir, entry));

const child = spawn(process.execPath, ["--test", ...testFiles], {
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

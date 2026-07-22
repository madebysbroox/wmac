import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("family member tuition fields auto-save individual monthly amounts", async () => {
  const renderer = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");

  assert.match(renderer, /data-member-tuition=/);
  assert.match(renderer, /addEventListener\("input", \(\) => queueMemberTuitionSave/);
  assert.match(renderer, /upsertMember\(state\.store, \{ \.\.\.member, monthlyAmount:/);
  assert.match(renderer, /saveStore\(`\$\{member\.name\}'s tuition saved`\)/);
});

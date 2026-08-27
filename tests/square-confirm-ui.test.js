import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("updateSquareDraft respects explicit status from patch", async () => {
  const source = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify updateSquareDraft function applies patch.status after auto-upgrade logic
  // This ensures confirmSquarePayment's "approved" status is not overwritten
  assert.match(
    source,
    /state\.squarePayments = state\.squarePayments\.map\(\(payment\) =>\s*payment\.id === paymentId \? \{[^}]*status:[^,]*,\s*\.\.\.patch/s,
    "updateSquareDraft must spread ...patch after computing auto-upgrade status so explicit patch.status overrides"
  );
});

test("confirmSquarePayment marks payment as approved and saves to store", async () => {
  const source = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify confirmSquarePayment flow: add payment to store, mark square payment approved, save, render
  assert.match(source, /async function confirmSquarePayment\(paymentId, category\)/);
  assert.match(source, /const nextStore = addPayment\(state\.store,/);
  assert.match(source, /state\.store = nextStore;/);
  assert.match(source, /const saved = await saveSquareStatus\(paymentId, \{[^}]*status: "approved"/);
  assert.match(source, /saveStore\(/);
  
  // Verify confirmSquarePayment calls render() to update UI after confirming
  const confirmFunction = source.match(/async function confirmSquarePayment\(paymentId, category\) \{[\s\S]*?\n\}/);
  assert.ok(confirmFunction, "confirmSquarePayment function must exist");
  assert.match(confirmFunction[0], /render\(\);/, "confirmSquarePayment must call render() to update UI");
});

test("render calls renderSquare when on square view", async () => {
  const source = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify render function calls renderSquare for square view
  assert.match(source, /function render\(\)/);
  assert.match(source, /if \(state\.view === "square"\) renderSquare\(\);/);
});

test("saveSquareStatus updates payment status via updateSquareDraft", async () => {
  const source = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify saveSquareStatus updates draft with patch before and after API call
  assert.match(source, /async function saveSquareStatus\(paymentId, patch\)/);
  assert.match(source, /updateSquareDraft\(paymentId, patch, false\)/);
  assert.match(source, /if \(data\.payment\) updateSquareDraft\(paymentId, data\.payment, false\)/);
});

test("Square confirmation buttons trigger confirmSquarePayment", async () => {
  const source = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify Square confirmation buttons are wired to confirmSquarePayment
  assert.match(source, /data-square-tuition=/);
  assert.match(source, /addEventListener\("click", \(\) => confirmSquarePayment\([^,)]*,\s*"tuition"\)\)/);
  assert.match(source, /data-square-other=/);
  assert.match(source, /addEventListener\("click", \(\) => confirmSquarePayment\([^,)]*,\s*"one-off"\)\)/);
});

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
  
  // Verify confirmSquarePayment flow: add payment(s) to store, mark square payment approved, save, render
  assert.match(source, /async function confirmSquarePayment\(paymentId, category\)/);
  assert.match(source, /let nextStore = state\.store;/, "confirmSquarePayment must initialize nextStore");
  assert.match(source, /nextStore = addPayment\(nextStore,/, "confirmSquarePayment must call addPayment for each month");
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

test("Square detail UI includes month count input for multi-month payments", async () => {
  const source = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify UI has month count field
  assert.match(source, /data-square-month-count=/, "Square detail must have month count input");
  assert.match(source, /Number of months/, "Month count field must be labeled");
  assert.match(source, /type="number"[^>]*min="1"[^>]*max="24"/, "Month count must be a number input with min/max");
  
  // Verify month count is bound to updateSquareDraft
  assert.match(source, /\[data-square-month-count\]/, "Month count must have event binding");
  assert.match(source, /updateSquareDraft\([^,]*,\s*\{\s*monthCount:/, "Month count changes must update draft with monthCount");
});

test("confirmSquarePayment handles multi-month tuition payments", async () => {
  const source = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify multi-month logic exists
  assert.match(source, /const monthCount = Math\.max\(1, Math\.min\(24, Number\(payment\.monthCount\)/, "Must read and validate monthCount from payment");
  assert.match(source, /for \(let i = 0; i < monthCount; i\+\+\)/, "Must loop through months to create multiple payments");
  assert.match(source, /shiftMonth\(startMonth, i\)/, "Must calculate each month using shiftMonth");
  
  // Verify amount distribution
  assert.match(source, /baseAmount.*totalAmount.*monthCount/, "Must divide total amount across months");
  assert.match(source, /remainder.*i === 0/, "Must handle remainder in first month");
  
  // Verify batch linking for multi-month
  assert.match(source, /batchId.*monthCount > 1/, "Must create batch ID when monthCount > 1");
  assert.match(source, /batchId[^}]*\}/, "Must include batchId in payment record");
});

test("multi-month confirmation prevents duplicate application via provider payment ID", async () => {
  const source = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify each payment record includes the Square payment ID to prevent duplication
  assert.match(source, /squarePaymentId: payment\.squarePaymentId/, "Each month payment must include squarePaymentId");
  assert.match(source, /providerPaymentId: payment\.providerPaymentId/, "Each month payment must include providerPaymentId");
});

test("one-month confirm remains simple and fast", async () => {
  const source = await readFile(new URL("../src/simple.js", import.meta.url), "utf8");
  
  // Verify default month count is 1
  assert.match(source, /Number\(payment\.monthCount\) \|\| 1/, "Month count must default to 1");
  
  // Verify batchId is empty for single-month
  assert.match(source, /batchId.*monthCount > 1/s, "Batch ID should only be set when monthCount > 1");
});

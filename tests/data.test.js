import test from "node:test";
import assert from "node:assert/strict";
import {
  addPayment,
  createEmptyStore,
  exportStoreRows,
  getMemberBalance,
  getMemberStatus,
  guessColumnMap,
  importMembersFromRecords,
  importPaymentsFromRecords,
  parseCsv,
  searchMembers,
  toCsv
} from "../src/data.js";

test("parses CSV with quoted commas", () => {
  const parsed = parseCsv('Member Name,Monthly Amount\n"Lee, Sam","$120.00"\n');
  assert.deepEqual(parsed.headers, ["Member Name", "Monthly Amount"]);
  assert.equal(parsed.records[0]["Member Name"], "Lee, Sam");
});

test("guesses member columns with friendly aliases", () => {
  const map = guessColumnMap(["Student Name", "Tuition", "Cell"]);
  assert.equal(map.name, "Student Name");
  assert.equal(map.monthlyAmount, "Tuition");
  assert.equal(map.phone, "Cell");
});

test("imports members and supports partial name search", () => {
  const parsed = parseCsv("Student Name,Tuition,Email\nSam Park,120,sam@example.com\nSarah Kim,120,sarah@example.com\n");
  const result = importMembersFromRecords(parsed.records, guessColumnMap(parsed.headers), createEmptyStore());
  assert.equal(result.imported.length, 2);
  assert.deepEqual(searchMembers(result.store.members, "Sa").map((member) => member.name), ["Sam Park", "Sarah Kim"]);
});

test("calculates paid, watch, and late status", () => {
  let store = createEmptyStore();
  const imported = importMembersFromRecords(
    [{ Name: "Sam Park", Amount: "120" }, { Name: "Sarah Kim", Amount: "120", Start: "2026-06-01" }],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    store
  );
  store = imported.store;
  store = addPayment(store, { memberId: store.members[0].id, month: "2026-06", amount: 120 });

  assert.equal(getMemberStatus(store.members[0], store.payments, new Date("2026-06-08")).level, "paid");
  assert.equal(getMemberStatus(store.members[1], store.payments, new Date("2026-06-08")).level, "watch");
  assert.equal(getMemberStatus(store.members[1], store.payments, new Date("2026-09-08")).level, "late");
});

test("imports payment CSV by email and exports backup rows", () => {
  const memberImport = importMembersFromRecords(
    [{ Name: "Sam Park", Email: "sam@example.com", Amount: "120" }],
    { name: "Name", email: "Email", monthlyAmount: "Amount" },
    createEmptyStore()
  );
  const paymentImport = importPaymentsFromRecords(
    [{ Email: "sam@example.com", Month: "2026-06", Amount: "$120", Date: "2026-06-01" }],
    { email: "Email", month: "Month", amount: "Amount", paidAt: "Date" },
    memberImport.store
  );

  assert.equal(paymentImport.matches.length, 1);
  const rows = exportStoreRows(paymentImport.store);
  const csv = toCsv(rows);
  assert.match(csv, /Sam Park/);
  assert.match(csv, /2026-06/);
});

test("calculates invoice balance from unpaid months", () => {
  let store = createEmptyStore();
  const imported = importMembersFromRecords(
    [{ Name: "Sam Park", Amount: "120", Start: "2026-04-01" }],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    store
  );
  store = imported.store;
  store = addPayment(store, { memberId: store.members[0].id, month: "2026-04", amount: 120 });

  const balance = getMemberBalance(store.members[0], store.payments, new Date("2026-06-08"));
  assert.deepEqual(balance.unpaidMonths, ["2026-05", "2026-06"]);
  assert.equal(balance.totalDue, 240);
});

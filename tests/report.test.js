import test from "node:test";
import assert from "node:assert/strict";
import {
  addPayment,
  createEmptyStore,
  exportRosterRows,
  getYearRevenue,
  guessColumnMap,
  importMembersFromRecords,
  toCsv,
  upsertMember
} from "../src/data.js";

function buildStore() {
  const imported = importMembersFromRecords(
    [
      { Name: "Sam Park", Amount: "120", Email: "sam@example.com" },
      { Name: "Sarah Kim", Amount: "135", Email: "sarah@example.com" }
    ],
    { name: "Name", monthlyAmount: "Amount", email: "Email" },
    createEmptyStore()
  );
  return imported.store;
}

test("totals year revenue by month and by member", () => {
  let store = buildStore();
  const [sam, sarah] = store.members;
  store = addPayment(store, { memberId: sam.id, month: "2026-01", amount: 120 });
  store = addPayment(store, { memberId: sam.id, month: "2026-02", amount: 120 });
  store = addPayment(store, { memberId: sarah.id, month: "2026-01", amount: 135 });
  store = addPayment(store, { memberId: sam.id, month: "2025-12", amount: 120 });

  const report = getYearRevenue(store, 2026);
  assert.equal(report.year, 2026);
  assert.equal(report.totalRevenue, 375);
  assert.equal(report.paymentCount, 3);
  assert.equal(report.monthly.length, 12);
  assert.deepEqual(report.monthly[0], { month: "2026-01", count: 2, total: 255 });
  assert.deepEqual(report.monthly[1], { month: "2026-02", count: 1, total: 120 });
  assert.deepEqual(report.monthly[11], { month: "2026-12", count: 0, total: 0 });
  assert.deepEqual(
    report.byMember.map((entry) => [entry.name, entry.total, entry.count]),
    [["Sam Park", 240, 2], ["Sarah Kim", 135, 1]]
  );

  const lastYear = getYearRevenue(store, 2025);
  assert.equal(lastYear.totalRevenue, 120);
  assert.equal(lastYear.paymentCount, 1);
});

test("year revenue is empty for a year with no payments", () => {
  const report = getYearRevenue(buildStore(), 2024);
  assert.equal(report.totalRevenue, 0);
  assert.equal(report.paymentCount, 0);
  assert.deepEqual(report.byMember, []);
});

test("next-year roster exports only active members with importable headers", () => {
  let store = buildStore();
  store = upsertMember(store, { ...store.members[1], inactive: true });

  const rows = exportRosterRows(store);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]["Member Name"], "Sam Park");
  assert.equal(rows[0]["Monthly Amount"], "120.00");

  // Re-importing the exported file must auto-map without manual fixes.
  const map = guessColumnMap(Object.keys(rows[0]));
  assert.equal(map.name, "Member Name");
  assert.equal(map.startDate, "Contract Start Date");
  assert.equal(map.monthlyAmount, "Monthly Amount");
  assert.equal(map.email, "Email");
  assert.equal(map.phone, "Phone");
  assert.equal(map.parentName, "Parent/Guardian Name");
  assert.equal(map.externalId, "Member ID");

  assert.match(toCsv(rows), /Sam Park/);
});

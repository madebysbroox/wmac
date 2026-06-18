import test from "node:test";
import assert from "node:assert/strict";
import {
  addPayment,
  createEmptyStore,
  getDashboardSummary,
  exportStoreRows,
  getMemberBalance,
  getMemberStatus,
  guessColumnMap,
  importMembersFromRecords,
  importPaymentsFromRecords,
  normalizeSquarePayment,
  pendingSquarePaymentsForMember,
  parseCsv,
  removePayment,
  searchMembers,
  squarePaymentMonth,
  suggestedSquareMember,
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

test("re-importing an updated member CSV fills blanks without duplicating or erasing", () => {
  // First import: Sam has a phone but no email or parent yet
  const first = importMembersFromRecords(
    [{ Name: "Sam Park", Amount: "120", Phone: "555-0101" }],
    { name: "Name", monthlyAmount: "Amount", phone: "Phone" },
    createEmptyStore()
  );

  // The updated spreadsheet adds an email and parent, but leaves phone blank
  const second = importMembersFromRecords(
    [{ Name: "Sam Park", Amount: "120", Email: "sam@example.com", Parent: "Joon Park", Phone: "" }],
    { name: "Name", monthlyAmount: "Amount", email: "Email", parentName: "Parent", phone: "Phone" },
    first.store
  );

  assert.equal(second.store.members.length, 1, "no duplicate member created");
  assert.equal(second.added.length, 0);
  assert.equal(second.updated.length, 1);
  const sam = second.store.members[0];
  assert.equal(sam.id, first.store.members[0].id, "keeps the same member id");
  assert.equal(sam.email, "sam@example.com", "fills in the new email");
  assert.equal(sam.parentName, "Joon Park", "fills in the new parent");
  assert.equal(sam.phone, "5550101", "blank cell does not erase the existing phone");
});

test("re-import matches by email even when the name was corrected", () => {
  const first = importMembersFromRecords(
    [{ Name: "Sam Park", Amount: "120", Email: "sam@example.com" }],
    { name: "Name", monthlyAmount: "Amount", email: "Email" },
    createEmptyStore()
  );
  const second = importMembersFromRecords(
    [{ Name: "Samuel Park", Amount: "120", Email: "sam@example.com" }],
    { name: "Name", monthlyAmount: "Amount", email: "Email" },
    first.store
  );
  assert.equal(second.store.members.length, 1);
  assert.equal(second.store.members[0].name, "Samuel Park", "name is updated in place");
});

test("re-importing a payment CSV skips months already recorded", () => {
  const memberImport = importMembersFromRecords(
    [{ Name: "Sam Park", Email: "sam@example.com", Amount: "120" }],
    { name: "Name", email: "Email", monthlyAmount: "Amount" },
    createEmptyStore()
  );
  const records = [{ Email: "sam@example.com", Month: "2026-06", Amount: "$120" }];
  const columnMap = { email: "Email", month: "Month", amount: "Amount" };

  const first = importPaymentsFromRecords(records, columnMap, memberImport.store);
  assert.equal(first.matches.length, 1);

  const second = importPaymentsFromRecords(records, columnMap, first.store);
  assert.equal(second.matches.length, 0, "nothing added the second time");
  assert.equal(second.duplicates.length, 1);
  assert.equal(second.store.payments.length, 1, "payment is not doubled");
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

test("removing a payment marks that month unpaid again", () => {
  const imported = importMembersFromRecords(
    [{ Name: "Sam Park", Amount: "120", Start: "2026-06-01" }],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    createEmptyStore()
  );
  let store = addPayment(imported.store, { memberId: imported.store.members[0].id, month: "2026-06", amount: 120 });
  assert.equal(getMemberStatus(store.members[0], store.payments, new Date("2026-06-08")).level, "paid");

  store = removePayment(store, store.members[0].id, "2026-06");

  assert.equal(getMemberStatus(store.members[0], store.payments, new Date("2026-06-08")).level, "watch");
  assert.deepEqual(getMemberBalance(store.members[0], store.payments, new Date("2026-06-08")).unpaidMonths, ["2026-06"]);
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

test("does not count months before a member's start date as unpaid", () => {
  let store = createEmptyStore();
  const imported = importMembersFromRecords(
    [{ Name: "New Student", Amount: "120", Start: "2026-06-08" }],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    store
  );
  store = imported.store;

  const status = getMemberStatus(store.members[0], store.payments, new Date("2026-06-08"));
  const balance = getMemberBalance(store.members[0], store.payments, new Date("2026-06-08"));

  assert.deepEqual(status.recentMonths.map((month) => month.month), ["2026-06"]);
  assert.deepEqual(balance.unpaidMonths, ["2026-06"]);
  assert.equal(balance.totalDue, 120);
});

test("members with a future start date are not marked as missing payments", () => {
  let store = createEmptyStore();
  const imported = importMembersFromRecords(
    [{ Name: "Future Student", Amount: "120", Start: "2026-07-01" }],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    store
  );
  store = imported.store;

  const status = getMemberStatus(store.members[0], store.payments, new Date("2026-06-08"));
  const balance = getMemberBalance(store.members[0], store.payments, new Date("2026-06-08"));

  assert.equal(status.level, "paid");
  assert.deepEqual(status.recentMonths, []);
  assert.deepEqual(balance.unpaidMonths, []);
  assert.equal(balance.totalDue, 0);
});

test("dashboard summary separates late money, at-risk current month, and healthy cash flow", () => {
  let store = createEmptyStore();
  const imported = importMembersFromRecords(
    [
      { Name: "Older Balance", Amount: "120", Start: "2026-04-15" },
      { Name: "Healthy Member", Amount: "100", Start: "2026-06-25" },
      { Name: "Paid Member", Amount: "90", Start: "2026-06-01" }
    ],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    store
  );
  store = imported.store;
  const older = store.members.find((member) => member.name === "Older Balance");
  const paid = store.members.find((member) => member.name === "Paid Member");
  store = addPayment(store, { memberId: older.id, month: "2026-04", amount: 120 });
  store = addPayment(store, { memberId: paid.id, month: "2026-06", amount: 90 });

  const summary = getDashboardSummary(store, new Date("2026-06-18"));

  assert.equal(summary.pastDue, 240);
  assert.equal(summary.tenDaysLate, 120);
  assert.equal(summary.delinquentCurrentMonthRisk, 120);
  assert.equal(summary.paidThisMonth, 90);
  assert.equal(summary.paidThisYear, 210);
  assert.equal(summary.expectedCurrentMonthFromUpToDate, 100);
  assert.equal(summary.delinquentMembers, 1);
});

test("normalizes Square payments and suggests a member match", () => {
  const memberImport = importMembersFromRecords(
    [{ Name: "Sam Park", Email: "sam@example.com", Amount: "120" }],
    { name: "Name", email: "Email", monthlyAmount: "Amount" },
    createEmptyStore()
  );
  const event = {
    type: "payment.updated",
    event_id: "evt_123",
    data: {
      object: {
        payment: {
          id: "pay_123",
          status: "COMPLETED",
          created_at: "2026-06-15T14:30:00Z",
          total_money: { amount: 12000, currency: "USD" },
          buyer_email_address: "sam@example.com",
          receipt_url: "https://squareup.com/receipt/preview/pay_123"
        }
      }
    }
  };

  const squarePayment = normalizeSquarePayment(event, memberImport.store.members);

  assert.equal(squarePayment.id, "pay_123");
  assert.equal(squarePayment.amountCents, 12000);
  assert.equal(squarePayment.status, "pending");
  assert.equal(squarePaymentMonth(squarePayment), "2026-06");
  assert.equal(suggestedSquareMember(squarePayment, memberImport.store.members).name, "Sam Park");
});

test("pending Square payments can be attached to a member without becoming real payments", () => {
  const memberImport = importMembersFromRecords(
    [{ Name: "Sam Park", Email: "sam@example.com", Amount: "120" }],
    { name: "Name", email: "Email", monthlyAmount: "Amount" },
    createEmptyStore()
  );
  const member = memberImport.store.members[0];
  const squarePayment = normalizeSquarePayment(
    {
      id: "pay_pending",
      amountCents: 12000,
      paidAt: "2026-06-15",
      buyerEmail: "sam@example.com"
    },
    memberImport.store.members
  );

  assert.equal(memberImport.store.payments.length, 0);
  assert.equal(pendingSquarePaymentsForMember([squarePayment], member).length, 1);
});

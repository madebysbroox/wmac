import test from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_STORE_VERSION,
  addPayment,
  accountMembers,
  bringMemberUpToDate,
  createEmptyStore,
  defaultAgreementEndDate,
  exportDailyPaymentStatusRows,
  getAgreementExpirationStatus,
  getContractDownPaymentRecord,
  clearContractDownPayment,
  getDashboardSummary,
  exportStoreRows,
  exportRosterRows,
  getMemberBalance,
  getMemberPaymentState,
  getMemberStatus,
  getResponsibleParty,
  getLandscapeRows,
  getAttentionRows,
  getYearRevenue,
  guessColumnMap,
  householdMembers,
  importMembersFromRecords,
  importPaymentsFromRecords,
  isFullBackupCsv,
  normalizeSquarePayment,
  nextUnpaidTuitionMonth,
  pendingSquarePaymentsForMember,
  parseCsv,
  prepareStoreForLoad,
  recordContractDownPayment,
  removePayment,
  reconcileDuePayments,
  restoreStoreFromBackupRows,
  searchMembers,
  isActiveParticipant,
  squarePaymentMonth,
  suggestedSquareMember,
  toCsv,
  undoPaymentBatch,
  migrateStore,
  upsertMember
} from "../src/data.js";

test("parses CSV with quoted commas", () => {
  const parsed = parseCsv('Member Name,Monthly Amount\n"Lee, Sam","$120.00"\n');
  assert.deepEqual(parsed.headers, ["Member Name", "Monthly Amount"]);
  assert.equal(parsed.records[0]["Member Name"], "Lee, Sam");
});

test("full backup CSV restores every member field and payment to a fresh store", () => {
  const source = {
    version: 2,
    members: [
      {
        id: "payer-1", name: "Morgan Lee", email: "morgan@example.com", householdName: "Lee",
        householdRole: "parent_guardian", responsiblePartyId: "payer-1", participant: false,
        collectionPlacement: { status: "charged_off", chargeOffDate: "2026-05-01", frozenBalance: 240 }
      },
      {
        id: "student-1", name: "Jamie Lee", responsiblePartyId: "payer-1", parentName: "Morgan Lee",
        householdName: "Lee", householdRole: "child", monthlyAmount: 120, startDate: "2026-01-15",
        agreementEndDate: "2027-01-15", cellPhone: "5550101", emailConsent: "Yes", participant: true
      }
    ],
    payments: [{
      id: "payment-1", memberId: "student-1", month: "2026-04", amount: 120, paidAt: "2026-04-15",
      source: "Square", category: "tuition", note: "Paid at front desk", providerPaymentId: "square-123"
    }]
  };
  const parsed = parseCsv(toCsv(exportStoreRows(source)));
  const restored = restoreStoreFromBackupRows(parsed.records);
  const student = restored.store.members.find((member) => member.id === "student-1");
  const payer = restored.store.members.find((member) => member.id === "payer-1");

  assert.equal(isFullBackupCsv(parsed.headers), true);
  assert.equal(restored.memberCount, 2);
  assert.equal(restored.paymentCount, 1);
  assert.equal(student.responsiblePartyId, "payer-1");
  assert.equal(student.agreementEndDate, "2027-01-15");
  assert.equal(student.emailConsent, "Yes");
  assert.deepEqual(payer.collectionPlacement, source.members[0].collectionPlacement);
  assert.deepEqual(restored.store.payments[0], source.payments[0]);
});

test("daily status export records every account and every month in the report year", () => {
  const payer = {
    id: "payer-1",
    name: "Morgan Lee",
    householdId: "lee",
    householdRole: "parent_guardian",
    participant: false,
    inactive: false,
    startDate: "2026-01-15"
  };
  const student = {
    id: "student-1",
    name: "Jamie Lee",
    responsiblePartyId: payer.id,
    householdId: "lee",
    startDate: "2026-01-15",
    monthlyAmount: 120,
    participant: true,
    inactive: false
  };
  const rows = exportDailyPaymentStatusRows({
    members: [student, payer],
    payments: [{ id: "jan", memberId: student.id, month: "2026-01", amount: 120, paidAt: "2026-01-15" }]
  }, new Date("2026-02-20T12:00:00"));
  const studentRow = rows.find((row) => row["Member Name"] === "Jamie Lee");
  const payerRow = rows.find((row) => row["Member Name"] === "Morgan Lee");

  assert.equal(rows.length, 2);
  assert.equal(studentRow["Account Holder / Contract Signer"], "Morgan Lee");
  assert.equal(studentRow["Current Status"], "Covered by payer");
  assert.equal(studentRow["Jan 2026"], "Covered by payer");
  assert.equal(payerRow["Jan 2026"], "Paid");
  assert.equal(payerRow["Feb 2026"], "Due");
  assert.equal(payerRow["Mar 2026"], "Future");
  assert.equal(payerRow["Dec 2026"], "Future");
});

test("uses the saved responsible party before falling back to a matching parent name", () => {
  const parent = { id: "parent-1", name: "Morgan Lee", householdId: "lee" };
  const child = { id: "child-1", name: "Jamie Lee", parentName: "Morgan Lee", householdId: "lee" };
  assert.equal(getResponsibleParty(child, [parent, child]).id, parent.id);
  assert.equal(getResponsibleParty({ ...child, responsiblePartyId: child.id }, [parent, child]).id, child.id);
});

test("guesses member columns with friendly aliases", () => {
  const map = guessColumnMap(["Student Name", "Tuition", "Cell"]);
  assert.equal(map.name, "Student Name");
  assert.equal(map.monthlyAmount, "Tuition");
  assert.equal(map.phone, "Cell");
});

test("stores collection-ready member contact and agreement fields", () => {
  const parsed = parseCsv([
    "Member Name,Contract Start Date,Address,City,State,Zip Code,Date of Birth,Home Phone,Work Phone,Cell Phone,Agreement Type,Agreement End Date,Email Consent,Text Consent,Phone Consent,Down Payment,Monthly Amount,Late Fee Minimum,Late Fee Percentage",
    "Sam Park,2026-07-14,123 Main St,Warrenton,VA,20186,1990-05-20,540-555-0101,540-555-0102,540-555-0103,Contract,2027-08-01,Yes,No,Yes,50,120,10,7.5"
  ].join("\n"));
  const result = importMembersFromRecords(parsed.records, guessColumnMap(parsed.headers), createEmptyStore());
  const member = result.store.members[0];
  assert.equal(member.address, "123 Main St");
  assert.equal(member.city, "Warrenton");
  assert.equal(member.state, "VA");
  assert.equal(member.zip, "20186");
  assert.equal(member.dob, "1990-05-20");
  assert.equal(member.homePhone, "5405550101");
  assert.equal(member.workPhone, "5405550102");
  assert.equal(member.cellPhone, "5405550103");
  assert.equal(member.phone, "5405550103", "cell phone remains the primary matching phone");
  assert.equal(member.agreementType, "Contract");
  assert.equal(member.agreementEndDate, "2027-08-01", "manual contract exceptions are preserved");
  assert.equal(member.emailConsent, "Yes");
  assert.equal(member.textConsent, "No");
  assert.equal(member.phoneConsent, "Yes");
  assert.equal(member.downPayment, 50);
  assert.equal(member.lateFeeMinimum, 10);
  assert.equal(member.lateFeePercentage, 7.5);
});

test("defaults agreement end to one year after signing and clamps leap-day anniversaries", () => {
  assert.equal(defaultAgreementEndDate("2026-07-14"), "2027-07-14");
  assert.equal(defaultAgreementEndDate("2024-02-29"), "2025-02-28");
});

test("flags contracts within 30 days and changes state on expiration", () => {
  const member = {
    startDate: "2025-08-01",
    agreementEndDate: "2026-08-01",
    agreementType: "Contract",
    participant: true,
    inactive: false
  };
  assert.deepEqual(getAgreementExpirationStatus(member, new Date("2026-06-30T12:00:00")), {
    level: "active",
    expirationDate: "2026-08-01",
    daysUntil: 32
  });
  assert.deepEqual(getAgreementExpirationStatus(member, new Date("2026-07-02T12:00:00")), {
    level: "expiring",
    expirationDate: "2026-08-01",
    daysUntil: 30
  });
  assert.equal(getAgreementExpirationStatus(member, new Date("2026-08-01T12:00:00")).level, "expired");
  assert.equal(getAgreementExpirationStatus(member, new Date("2026-08-15T12:00:00")).daysUntil, -14);
});

test("uses a manual expiration date and skips non-renewing member records", () => {
  const specialContract = {
    startDate: "2026-01-01",
    agreementEndDate: "2026-09-15",
    agreementType: "Contract",
    participant: true,
    inactive: false
  };
  assert.equal(
    getAgreementExpirationStatus(specialContract, new Date("2026-08-20T12:00:00")).expirationDate,
    "2026-09-15"
  );
  assert.equal(getAgreementExpirationStatus({ ...specialContract, agreementType: "Month-to-Month" }).level, "none");
  assert.equal(getAgreementExpirationStatus({ ...specialContract, inactive: true }).level, "none");
  assert.equal(getAgreementExpirationStatus({ ...specialContract, participant: false }).level, "none");
});

test("imports members and supports partial name search", () => {
  const parsed = parseCsv("Student Name,Tuition,Email\nSam Park,120,sam@example.com\nSarah Kim,120,sarah@example.com\n");
  const result = importMembersFromRecords(parsed.records, guessColumnMap(parsed.headers), createEmptyStore());
  assert.equal(result.imported.length, 2);
  assert.deepEqual(searchMembers(result.store.members, "Sa").map((member) => member.name), ["Sam Park", "Sarah Kim"]);
});

test("groups parent and child records under the payer for searching and spreadsheet exports", () => {
  const result = importMembersFromRecords([
    { Name: "Zara Park", Family: "Park", Role: "Parent", Participant: "no" },
    { Name: "Amy Park", Family: "Park", Role: "Child", Participant: "yes", Amount: "120", Start: "2026-06-01" }
  ], {
    name: "Name", householdName: "Family", householdRole: "Role", participant: "Participant",
    monthlyAmount: "Amount", startDate: "Start"
  }, createEmptyStore());
  const parent = result.store.members.find((member) => member.name === "Zara Park");
  const child = result.store.members.find((member) => member.name === "Amy Park");

  assert.equal(child.responsiblePartyId, parent.id);
  assert.deepEqual(accountMembers(result.store.members, child).map((member) => member.name), ["Zara Park", "Amy Park"]);
  assert.deepEqual(searchMembers(result.store.members, "Amy").map((member) => member.name), ["Zara Park", "Amy Park"]);
  assert.deepEqual(searchMembers(result.store.members, "Zara").map((member) => member.name), ["Zara Park", "Amy Park"]);
  assert.deepEqual(exportRosterRows(result.store).map((row) => row["Member Name"]), ["Zara Park", "Amy Park"]);
  assert.equal(exportRosterRows(result.store)[1]["Account Holder / Payer"], "Zara Park");
});

test("calculates paid, watch, and late status", () => {
  let store = createEmptyStore();
  const imported = importMembersFromRecords(
    [{ Name: "Sam Park", Amount: "120", Start: "2026-06-01" }, { Name: "Sarah Kim", Amount: "120", Start: "2026-06-01" }],
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

test("bringing a member up to date keeps each month individually removable", () => {
  const imported = importMembersFromRecords(
    [{ Name: "Sam Park", Amount: "120", Start: "2026-04-01" }],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    createEmptyStore()
  );
  const member = imported.store.members[0];
  let store = bringMemberUpToDate(imported.store, member, new Date("2026-06-08"));

  assert.deepEqual(store.payments.map((payment) => payment.month).sort(), ["2026-04", "2026-05", "2026-06"]);
  assert.equal(getMemberStatus(member, store.payments, new Date("2026-06-08")).level, "paid");

  store = removePayment(store, member.id, "2026-05");
  assert.deepEqual(getMemberBalance(member, store.payments, new Date("2026-06-08")).unpaidMonths, ["2026-05"]);
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

test("family members can have independent contract start dates", () => {
  const imported = importMembersFromRecords(
    [
      { Name: "Sam Park", Family: "Park Family", Amount: "120", Start: "2026-04-01" },
      { Name: "Mina Park", Family: "Park Family", Amount: "120", Start: "2026-06-01" }
    ],
    { name: "Name", householdName: "Family", monthlyAmount: "Amount", startDate: "Start" },
    createEmptyStore()
  );
  const sam = imported.store.members.find((member) => member.name === "Sam Park");
  const mina = imported.store.members.find((member) => member.name === "Mina Park");

  assert.equal(sam.startDate, "2026-04-01");
  assert.equal(mina.startDate, "2026-06-01");
  assert.deepEqual(getMemberBalance(sam, imported.store.payments, new Date("2026-06-08")).unpaidMonths, ["2026-04", "2026-05", "2026-06"]);
  assert.deepEqual(getMemberBalance(mina, imported.store.payments, new Date("2026-06-08")).unpaidMonths, ["2026-06"]);
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

test("one-off Square payments count as revenue without marking tuition paid", () => {
  const imported = importMembersFromRecords(
    [{ Name: "Sam Park", Amount: "120", Start: "2026-06-01" }],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    createEmptyStore()
  );
  const member = imported.store.members[0];
  let store = addPayment(imported.store, {
    memberId: member.id,
    month: "2026-06",
    amount: 45,
    paidAt: "2026-06-12",
    source: "square",
    category: "one-off",
    squarePaymentId: "sq-one-off"
  });

  assert.equal(getMemberStatus(member, store.payments, new Date("2026-06-18")).level, "late");
  assert.deepEqual(getMemberBalance(member, store.payments, new Date("2026-06-18")).unpaidMonths, ["2026-06"]);

  const summary = getDashboardSummary(store, new Date("2026-06-18"));
  assert.equal(summary.paidThisMonth, 45);
  assert.equal(summary.paidThisYear, 45);

  const report = getYearRevenue(store, "2026");
  assert.equal(report.totalRevenue, 45);
  assert.equal(report.byMember[0].total, 45);

  store = addPayment(store, {
    memberId: member.id,
    month: "2026-06",
    amount: 120,
    paidAt: "2026-06-15",
    source: "square",
    category: "tuition",
    squarePaymentId: "sq-tuition"
  });

  assert.equal(getMemberStatus(member, store.payments, new Date("2026-06-18")).level, "paid");
  assert.equal(getDashboardSummary(store, new Date("2026-06-18")).paidThisMonth, 165);
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

test("normalizes Square relay payments from AWS staging", () => {
  const memberImport = importMembersFromRecords(
    [{ Name: "Sam Park", Email: "parent@example.com", Amount: "120" }],
    { name: "Name", email: "Email", monthlyAmount: "Amount" },
    createEmptyStore()
  );
  const squarePayment = normalizeSquarePayment(
    {
      paymentId: "pay_relay_123",
      eventId: "event_relay_123",
      eventType: "payment.updated",
      status: "pending",
      squareStatus: "COMPLETED",
      amountCents: 12000,
      currency: "USD",
      buyerEmailAddress: "parent@example.com",
      squareCreatedAt: "2026-06-08T14:00:00Z",
      squareUpdatedAt: "2026-06-08T14:01:00Z",
      receiptUrl: "https://squareup.com/receipt/preview/pay_relay_123"
    },
    memberImport.store.members
  );

  assert.equal(squarePayment.id, "pay_relay_123");
  assert.equal(squarePayment.squareEventId, "event_relay_123");
  assert.equal(squarePayment.sourceEventType, "payment.updated");
  assert.equal(squarePayment.status, "pending");
  assert.equal(squarePayment.squareStatus, "COMPLETED");
  assert.equal(squarePayment.buyerEmail, "parent@example.com");
  assert.equal(squarePayment.paidAt, "2026-06-08");
  assert.equal(squarePayment.suggestedMemberId, memberImport.store.members[0].id);
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

test("finds the next unpaid tuition month for card payment review", () => {
  const imported = importMembersFromRecords(
    [{ Name: "Sam Park", Amount: "120", Start: "2026-04-01" }],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    createEmptyStore()
  );
  const member = imported.store.members[0];
  const store = addPayment(imported.store, { memberId: member.id, month: "2026-04", amount: 120 });

  assert.equal(nextUnpaidTuitionMonth(member, store.payments, new Date("2026-06-12")), "2026-05");
});

test("groups parents and children while excluding contact-only parents from tuition totals", () => {
  const records = [
    { Name: "Joon Park", Family: "Park Family", Role: "Parent", Participant: "no", Programs: "" },
    { Name: "Sam Park", Family: "Park Family", Role: "Child", Participant: "yes", Programs: "Tae Kwon Do; Muay Thai", Belt: "Yellow Belt", Next: "Orange Belt", Amount: "120", Start: "2026-06-01" }
  ];
  const result = importMembersFromRecords(records, {
    name: "Name", householdName: "Family", householdRole: "Role", participant: "Participant",
    programs: "Programs", beltLevel: "Belt", nextLevel: "Next", monthlyAmount: "Amount", startDate: "Start"
  }, createEmptyStore());
  const parent = result.store.members.find((member) => member.name === "Joon Park");
  const child = result.store.members.find((member) => member.name === "Sam Park");

  assert.equal(parent.participant, false);
  assert.equal(isActiveParticipant(parent), false);
  assert.deepEqual(child.programs, ["tae_kwon_do", "muay_thai"]);
  assert.deepEqual(householdMembers(result.store.members, child).map((member) => member.name), ["Joon Park", "Sam Park"]);
  assert.deepEqual(getMemberBalance(parent, [], new Date("2026-06-18")).unpaidMonths, []);
  assert.equal(getDashboardSummary(result.store, new Date("2026-06-18")).activeMembers, 1);
  assert.equal(getDashboardSummary(result.store, new Date("2026-06-18")).nonParticipantContacts, 1);

  const roster = exportRosterRows(result.store);
  assert.equal(roster.length, 2, "new-year roster keeps the contact-only parent");
  const childRow = roster.find((row) => row["Member Name"] === "Sam Park");
  assert.equal(childRow["Household Name"], "Park Family");
  assert.equal(childRow.Programs, "tae_kwon_do; muay_thai");
});

test("uses the payer account for a non-participating parent's family payment schedule", () => {
  const payer = {
    id: "payer",
    name: "Morgan Lee",
    participant: false,
    householdRole: "parent_guardian",
    responsiblePartyId: "payer",
    startDate: "2026-04-10"
  };
  const child = {
    id: "child",
    name: "Jamie Lee",
    participant: true,
    householdRole: "child",
    responsiblePartyId: "payer",
    monthlyAmount: 120,
    startDate: "2026-04-15"
  };
  const members = [payer, child];
  const today = new Date("2026-06-18T12:00:00");

  const payerState = getMemberPaymentState(payer, [], today, [], members);
  const childState = getMemberPaymentState(child, [], today, [], members);

  assert.deepEqual(payerState.unpaidMonths, ["2026-04", "2026-05", "2026-06"]);
  assert.equal(getMemberBalance(payer, [], today, members).monthlyAmount, 120);
  assert.deepEqual(childState.billableMonths, []);
  assert.equal(getMemberBalance(child, [], today, members).dueNow, 0);
  assert.equal(getLandscapeRows({ members, payments: [] }, [], today).rows.length, 1);
  assert.equal(getAttentionRows({ members, payments: [] }, [], today).length, 1);

  const reconciled = reconcileDuePayments({ members, payments: [] }, payer, ["2026-05"], today);
  assert.deepEqual(reconciled.store.payments.map((payment) => payment.memberId), ["payer", "payer"]);
  assert.deepEqual(getMemberBalance(payer, reconciled.store.payments, today, members).unpaidMonths, ["2026-05"]);
});

test("updating any family member's tuition immediately changes the payer account total", () => {
  const payer = { id: "payer", name: "Morgan Lee", participant: false, responsiblePartyId: "payer", startDate: "2026-04-10" };
  const child = { id: "child", name: "Jamie Lee", participant: true, responsiblePartyId: "payer", monthlyAmount: 120 };
  const sibling = { id: "sibling", name: "Taylor Lee", participant: true, responsiblePartyId: "payer", monthlyAmount: 80 };
  const store = { members: [payer, child, sibling], payments: [] };

  const updated = upsertMember(store, { ...child, monthlyAmount: 145.5 });
  assert.equal(updated.members.find((member) => member.id === "child").monthlyAmount, 145.5);
  assert.equal(getMemberBalance(payer, [], new Date("2026-06-18T12:00:00"), updated.members).monthlyAmount, 225.5);
});

test("uses only the payer contract signing date for a household due day", () => {
  const payer = { id: "payer", name: "Morgan Lee", participant: false, responsiblePartyId: "payer", startDate: "2026-01-10" };
  const child = { id: "child", name: "Jamie Lee", participant: true, responsiblePartyId: "payer", monthlyAmount: 120, startDate: "2026-01-25" };
  const state = getMemberPaymentState(payer, [], new Date("2026-02-15T12:00:00"), [], [payer, child]);

  assert.equal(state.months.find((month) => month.month === "2026-02").dueDate, "2026-02-10");
});

test("treats a contract down payment as the first and last prepaid month", () => {
  const member = {
    id: "contract-member",
    name: "Morgan Lee",
    participant: true,
    monthlyAmount: 120,
    startDate: "2026-01-15",
    agreementType: "Contract",
    agreementEndDate: "2027-01-15",
    downPayment: 240
  };
  const state = getMemberPaymentState(member, [], new Date("2027-02-01T12:00:00"));

  assert.deepEqual(state.billableMonths, ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
  assert.deepEqual([...state.prepaidMonths].sort(), ["2026-01", "2026-12"]);
  assert.deepEqual(state.unpaidMonths, ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
});

test("does not mark contract months prepaid when the down payment is partial", () => {
  const member = {
    id: "contract-partial-down-payment",
    name: "Partial Payment",
    monthlyAmount: 120,
    startDate: "2026-01-15",
    agreementEndDate: "2027-01-15",
    agreementType: "Contract",
    downPayment: 50,
    participant: true
  };
  const status = getMemberPaymentState(member, [], new Date("2026-12-20T12:00:00"), [], [member]);
  assert.deepEqual(status.prepaidMonths, new Set());
  assert.deepEqual(status.unpaidMonths, [
    "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
    "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"
  ]);
});

test("records a payer down payment only after an explicit action and remains idempotent", () => {
  let store = createEmptyStore();
  store = upsertMember(store, {
    id: "payer-with-down-payment",
    name: "Morgan Lee",
    participant: true,
    monthlyAmount: 120,
    startDate: "2026-12-28",
    agreementType: "Contract",
    downPayment: 240
  });

  assert.deepEqual(store.payments, [], "saving a member must not create a financial transaction");
  const first = recordContractDownPayment(store, "payer-with-down-payment");
  assert.equal(first.changed, true);
  store = first.store;
  const downPayment = getContractDownPaymentRecord(store, "payer-with-down-payment");
  assert.deepEqual(
    {
      memberId: downPayment.memberId,
      amount: downPayment.amount,
      month: downPayment.month,
      paidAt: downPayment.paidAt,
      category: downPayment.category
    },
    {
      memberId: "payer-with-down-payment",
      amount: 240,
      month: "2026-12",
      paidAt: "2026-12-28",
      category: "down_payment"
    }
  );
  const activeContract = getMemberPaymentState(store.members[0], store.payments, new Date("2027-01-05T12:00:00"), [], store.members);
  assert.deepEqual([...activeContract.prepaidMonths], ["2026-12"]);
  assert.deepEqual(activeContract.unpaidMonths, ["2027-01"]);
  assert.equal(getYearRevenue(store, 2026).totalRevenue, 240);
  const second = recordContractDownPayment(store, "payer-with-down-payment");
  assert.equal(second.changed, false);
  assert.equal(second.store, store);
  assert.equal(migrateStore(store).payments.filter((payment) => payment.source === "contract-down-payment").length, 1);
});

test("a recorded down payment can be corrected by re-recording a new amount", () => {
  let store = createEmptyStore();
  store = upsertMember(store, {
    id: "correct-me",
    name: "Fix Me",
    participant: true,
    monthlyAmount: 120,
    startDate: "2026-03-10",
    agreementType: "Contract",
    downPayment: 240
  });
  store = recordContractDownPayment(store, "correct-me").store;
  assert.equal(getContractDownPaymentRecord(store, "correct-me").amount, 240);

  // The owner realizes the amount was wrong: edit the saved amount, then
  // re-record. Recording overwrites the existing entry instead of duplicating.
  store = upsertMember(store, { ...store.members[0], downPayment: 300 });
  const corrected = recordContractDownPayment(store, "correct-me");
  assert.equal(corrected.changed, true);
  store = corrected.store;
  const records = store.payments.filter((payment) => payment.source === "contract-down-payment");
  assert.equal(records.length, 1, "correcting must not create a duplicate down-payment entry");
  assert.equal(records[0].amount, 300);
  assert.equal(getYearRevenue(store, 2026).totalRevenue, 300);
});

test("clearing a recorded down payment removes the transaction but keeps the saved amount", () => {
  let store = createEmptyStore();
  store = upsertMember(store, {
    id: "clear-me",
    name: "Clear Me",
    participant: true,
    monthlyAmount: 120,
    startDate: "2026-04-01",
    agreementType: "Contract",
    downPayment: 240
  });
  store = recordContractDownPayment(store, "clear-me").store;
  assert.ok(getContractDownPaymentRecord(store, "clear-me"));

  const cleared = clearContractDownPayment(store, "clear-me");
  assert.equal(cleared.changed, true);
  store = cleared.store;
  assert.equal(getContractDownPaymentRecord(store, "clear-me"), null, "the recorded transaction is removed");
  assert.equal(store.members[0].downPayment, 240, "the saved contract amount is preserved for re-entry");
  assert.equal(getYearRevenue(store, 2026).totalRevenue, 0, "cleared money no longer counts as revenue");
});

test("clearing then re-recording a corrected amount works end to end", () => {
  let store = createEmptyStore();
  store = upsertMember(store, {
    id: "clear-and-fix",
    name: "Clear And Fix",
    participant: true,
    monthlyAmount: 100,
    startDate: "2026-05-05",
    agreementType: "Contract",
    downPayment: 250
  });
  store = recordContractDownPayment(store, "clear-and-fix").store;
  store = clearContractDownPayment(store, "clear-and-fix").store;
  store = upsertMember(store, { ...store.members[0], downPayment: 400 });
  const rerecorded = recordContractDownPayment(store, "clear-and-fix");
  assert.equal(rerecorded.changed, true);
  store = rerecorded.store;
  const records = store.payments.filter((payment) => payment.source === "contract-down-payment");
  assert.equal(records.length, 1);
  assert.equal(records[0].amount, 400);
});

test("clearing a down payment that was never recorded is a harmless no-op", () => {
  let store = createEmptyStore();
  store = upsertMember(store, {
    id: "nothing-recorded",
    name: "Nothing Recorded",
    participant: true,
    monthlyAmount: 120,
    startDate: "2026-06-01",
    agreementType: "Contract",
    downPayment: 240
  });
  const cleared = clearContractDownPayment(store, "nothing-recorded");
  assert.equal(cleared.changed, false);
  assert.equal(cleared.store, store);
  assert.equal(cleared.payment, null);
});

test("down-payment corrections must target the responsible payer", () => {
  let store = createEmptyStore();
  store = upsertMember(store, {
    id: "family-payer",
    name: "Family Payer",
    participant: false,
    monthlyAmount: 0,
    startDate: "2026-02-01",
    agreementType: "Contract",
    downPayment: 300
  });
  store = upsertMember(store, {
    id: "family-child",
    name: "Family Child",
    participant: true,
    responsiblePartyId: "family-payer",
    monthlyAmount: 150,
    startDate: "2026-02-01",
    agreementType: "Contract"
  });
  store = recordContractDownPayment(store, "family-payer").store;
  assert.throws(() => clearContractDownPayment(store, "family-child"), /responsible payer/);
});

test("loading a current store preserves member and payment records exactly", () => {
  const current = {
    version: 2,
    updatedAt: "2026-07-20T12:00:00.000Z",
    members: [{
      id: "member-1",
      name: "Original Name",
      startDate: "2026-01-15",
      downPayment: 240,
      customLegacyField: { keep: true }
    }],
    payments: [{
      id: "payment-1",
      memberId: "member-1",
      month: "2026-06",
      amount: 120,
      paidAt: "2026-06-15",
      customPaymentField: "keep-me"
    }]
  };
  const prepared = prepareStoreForLoad(current);
  assert.equal(prepared.needsBackup, true);
  assert.equal(prepared.sourceVersion, 2);
  assert.equal(prepared.targetVersion, CURRENT_STORE_VERSION);
  assert.equal(prepared.store.version, CURRENT_STORE_VERSION);
  assert.deepEqual(prepared.store.members, current.members);
  assert.deepEqual(prepared.store.payments, current.payments);
  assert.equal(prepared.store.updatedAt, current.updatedAt);
});

test("editing one member field preserves unknown fields and every payment", () => {
  const original = {
    version: CURRENT_STORE_VERSION,
    updatedAt: "2026-07-20T12:00:00.000Z",
    members: [{
      id: "member-1",
      name: "Original Name",
      email: "original@example.com",
      monthlyAmount: 120,
      startDate: "2026-01-15",
      participant: true,
      customLegacyField: { keep: true }
    }],
    payments: [{
      id: "payment-1",
      memberId: "member-1",
      month: "2026-06",
      amount: 120,
      paidAt: "2026-06-15",
      customPaymentField: "keep-me"
    }]
  };
  const edited = upsertMember(original, { ...original.members[0], name: "Updated Name" });
  assert.equal(edited.members[0].name, "Updated Name");
  assert.equal(edited.members[0].email, "original@example.com");
  assert.deepEqual(edited.members[0].customLegacyField, { keep: true });
  assert.deepEqual(edited.payments, original.payments);
});

test("matches a Square subscription payment by dedicated Square customer ID", () => {
  const result = importMembersFromRecords(
    [{ Name: "Sam Park", Square: "CUS_123", Amount: "120" }],
    { name: "Name", squareCustomerId: "Square", monthlyAmount: "Amount" },
    createEmptyStore()
  );
  const payment = normalizeSquarePayment({ payment: { id: "pay-sub", status: "COMPLETED", customer_id: "CUS_123", amount_money: { amount: 12000, currency: "USD" } } });
  assert.equal(suggestedSquareMember(payment, result.store.members)?.name, "Sam Park");
});

test("due-aware state separates upcoming, attention, and ten-day-behind tuition", () => {
  const imported = importMembersFromRecords(
    [{ Name: "Due Fifteenth", Amount: "120", Start: "2026-05-15" }],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    createEmptyStore()
  );
  const member = imported.store.members[0];
  let store = addPayment(imported.store, { memberId: member.id, month: "2026-05", amount: 120 });

  const before = getMemberPaymentState(member, store.payments, new Date("2026-06-14T12:00:00"));
  const due = getMemberPaymentState(member, store.payments, new Date("2026-06-15T12:00:00"));
  const late = getMemberPaymentState(member, store.payments, new Date("2026-06-25T12:00:00"));

  assert.equal(before.level, "paid");
  assert.deepEqual(before.upcomingUnpaidMonths.map((month) => month.month), ["2026-06"]);
  assert.equal(due.level, "watch");
  assert.equal(late.level, "late");
});

test("pending card payment is a flag and does not hide underlying debt", () => {
  const imported = importMembersFromRecords(
    [{ Name: "Sam Park", Amount: "120", Start: "2026-04-01" }],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    createEmptyStore()
  );
  const member = imported.store.members[0];
  const pending = [{ memberId: member.id, status: "pending", paymentMonth: "2026-06" }];
  const state = getMemberPaymentState(member, imported.store.payments, new Date("2026-06-18"), pending);

  assert.equal(state.level, "late");
  assert.equal(state.flags.pending, true);
  assert.equal(state.months.find((month) => month.month === "2026-06").state, "pending");
});

test("attention reconciliation is reversible as a batch and by individual month", () => {
  const imported = importMembersFromRecords(
    [{ Name: "Mina Park", Amount: "100", Start: "2026-04-01" }],
    { name: "Name", monthlyAmount: "Amount", startDate: "Start" },
    createEmptyStore()
  );
  const member = imported.store.members[0];
  const result = reconcileDuePayments(imported.store, member, ["2026-05"], new Date("2026-06-18"));

  assert.deepEqual(result.batch.months, ["2026-04", "2026-06"]);
  assert.deepEqual(getMemberBalance(member, result.store.payments, new Date("2026-06-18")).unpaidMonths, ["2026-05"]);

  const manuallyReversed = removePayment(result.store, member.id, "2026-04");
  assert.deepEqual(getMemberBalance(member, manuallyReversed.payments, new Date("2026-06-18")).unpaidMonths, ["2026-04", "2026-05"]);

  const undone = undoPaymentBatch(result.store, result.batch);
  assert.deepEqual(undone.payments, []);
});

test("landscape includes every active family member and twelve month cells", () => {
  const imported = importMembersFromRecords(
    [
      { Name: "Sam Park", Family: "Park", Amount: "120", Start: "2026-01-01", Belt: "Yellow Belt" },
      { Name: "Mina Park", Family: "Park", Amount: "120", Start: "2026-06-01", Belt: "Green Belt" }
    ],
    { name: "Name", householdName: "Family", monthlyAmount: "Amount", startDate: "Start", beltLevel: "Belt" },
    createEmptyStore()
  );
  const landscape = getLandscapeRows(imported.store, [], new Date("2026-06-18"));
  const attention = getAttentionRows(imported.store, [], new Date("2026-06-18"));

  assert.equal(landscape.rows.length, 2);
  assert.equal(landscape.rows[0].cells.length, 12);
  assert.notEqual(landscape.rows[0].certification, landscape.rows[1].certification);
  assert.equal(attention.length, 2);
});

test("store migration keeps household members' certifications independent and is idempotent", () => {
  const legacy = {
    version: 1,
    members: [
      { id: "a", name: "Sam", householdName: "Park", householdRole: "Parent", beltLevel: "Yellow Belt" },
      { id: "b", name: "Mina", householdName: "Park", householdRole: "Child", beltLevel: "Green Belt" }
    ],
    payments: []
  };
  const migrated = migrateStore(legacy);
  const twice = migrateStore(migrated);

  assert.equal(migrated.members[0].certifications.tae_kwon_do, "Yellow Belt");
  assert.equal(migrated.members[1].certifications.tae_kwon_do, "Green Belt");
  assert.equal(migrated.members[0].responsiblePartyId, "a");
  assert.equal(migrated.members[1].responsiblePartyId, "a");
  assert.deepEqual(twice, migrated);
});

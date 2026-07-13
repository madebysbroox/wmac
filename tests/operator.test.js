import test from "node:test";
import assert from "node:assert/strict";
import { getOperatorBrief } from "../src/operator.js";

function member(id, name, startDate, monthlyAmount, extra = {}) {
  return {
    id,
    name,
    startDate,
    monthlyAmount,
    participant: true,
    inactive: false,
    householdName: "",
    ...extra
  };
}

function tuition(id, memberId, month, amount, paidAt = `${month}-01`) {
  return { id, memberId, month, amount, paidAt, category: "tuition" };
}

function store(members = [], payments = []) {
  return { version: 2, members, payments };
}

test("returns a deterministic empty operator brief", () => {
  const brief = getOperatorBrief(store(), [], new Date("2026-06-18T12:00:00"));

  assert.equal(brief.asOf, "2026-06-18");
  assert.equal(brief.currentMonth, "2026-06");
  assert.deepEqual(brief.tuitionFollowups, []);
  assert.deepEqual(brief.pendingCards, []);
  assert.deepEqual(brief.setupRows, []);
  assert.deepEqual(brief.totals.dueNow, {
    members: 0,
    installments: 0,
    amount: 0,
    pendingMembers: 0,
    pendingInstallments: 0,
    pendingAmount: 0
  });
  assert.deepEqual(brief.totals.behind, { members: 0, installments: 0, amount: 0 });
  assert.equal(brief.totals.coverageRate, 0);
  assert.equal(brief.totals.next7Days.from, "2026-06-19");
  assert.equal(brief.totals.next7Days.through, "2026-06-25");
  assert.equal(brief.sixMonthFlow.length, 6);
  assert.deepEqual(brief.sixMonthFlow.map((row) => row.month), [
    "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"
  ]);
  assert.deepEqual(brief.householdRisk, []);
});

test("prioritizes the queue while pending months remain debt but are not contact urgency", () => {
  const members = [
    member("deep", "Deep Balance", "2026-05-01", 100),
    member("recent", "Recent Balance", "2026-06-15", 100),
    member("today", "Due Today", "2026-06-18", 100),
    member("setup", "Needs Setup", "", 100)
  ];
  const pending = [
    {
      id: "unmatched",
      status: "needs_match",
      amountCents: 5_000,
      paymentMonth: "2026-06",
      paidAt: "2026-06-17",
      buyerName: "Unknown Card"
    },
    {
      id: "deep-june",
      status: "pending",
      memberId: "deep",
      amountCents: 12_000,
      paymentMonth: "2026-06",
      paidAt: "2026-06-18"
    },
    { id: "ignored", status: "ignored", amountCents: 99_900, paymentMonth: "2026-06" }
  ];

  const brief = getOperatorBrief(store(members), pending, new Date("2026-06-18T12:00:00"));

  assert.deepEqual(brief.tuitionFollowups.map((item) => [item.reason, item.memberId]), [
    ["behind", "deep"],
    ["past_due", "recent"],
    ["due_today", "today"]
  ]);
  assert.deepEqual(brief.pendingCards.map((item) => [item.status, item.memberId]), [
    ["needs_match", ""],
    ["pending", "deep"]
  ]);

  const deepContact = brief.tuitionFollowups.find((item) => item.memberId === "deep");
  assert.deepEqual(deepContact.actionableMonths, ["2026-05"]);
  assert.deepEqual(deepContact.pendingMonths, ["2026-06"]);
  assert.equal(deepContact.actionableAmount, 100);
  assert.equal(deepContact.debtDueNowAmount, 200);

  assert.equal(brief.totals.dueNow.members, 3);
  assert.equal(brief.totals.dueNow.installments, 4);
  assert.equal(brief.totals.dueNow.amount, 400);
  assert.equal(brief.totals.behind.installments, 2);
  assert.equal(brief.totals.behind.amount, 200);
  assert.equal(brief.totals.dueNow.pendingInstallments, 1);
  assert.equal(brief.totals.dueNow.pendingAmount, 100);
  assert.equal(brief.pendingCards.length, 2);
  assert.equal(brief.pendingCards.reduce((total, item) => total + item.amount, 0), 170);
  assert.equal(brief.setupRows.length, 1);
  assert.equal(brief.setupRows[0].knownMonthlyAmount, 100);
  assert.deepEqual(brief.setupRows[0].missingFields, ["startDate"]);
});

test("does not create a contact follow-up when every due month has a pending provider item", () => {
  const waiting = member("waiting", "Waiting Card", "2026-06-01", 120);
  const pending = [{
    id: "card-waiting",
    status: "pending",
    suggestedMemberId: "waiting",
    paymentMonth: "2026-06",
    amountCents: 12_000,
    paidAt: "2026-06-18"
  }];

  const brief = getOperatorBrief(store([waiting]), pending, new Date("2026-06-18T12:00:00"));

  assert.deepEqual(brief.tuitionFollowups, []);
  assert.equal(brief.pendingCards.length, 1);
  assert.equal(brief.pendingCards[0].memberId, "waiting");
  assert.deepEqual(brief.totals.dueNow, {
    members: 1,
    installments: 1,
    amount: 120,
    pendingMembers: 1,
    pendingInstallments: 1,
    pendingAmount: 120
  });
  assert.equal(brief.householdRisk[0].rows[0].pendingDueAmount, 120);
});

test("separates cash receipt month from service-month tuition coverage", () => {
  const members = [
    member("a", "Applied in July", "2026-01-10", 100),
    member("b", "Still Open", "2026-01-10", 100)
  ];
  const payments = [
    tuition("july-tuition", "a", "2026-07", 100, "2026-06-30"),
    tuition("june-tuition", "a", "2026-06", 80, "2026-07-05"),
    { id: "other", memberId: "a", month: "2026-06", amount: 40, paidAt: "2026-07-02", category: "one-off" }
  ];

  const brief = getOperatorBrief(store(members, payments), [], new Date("2026-07-12T12:00:00"));

  assert.deepEqual(brief.totals.cashReceivedThisMonth, {
    payments: 2,
    amount: 120,
    tuitionAmount: 80,
    otherAmount: 40
  });
  assert.deepEqual(brief.totals.serviceMonthCovered, {
    members: 1,
    expectedAmount: 100,
    appliedAmount: 100
  });
  assert.deepEqual(brief.totals.serviceMonthExpected, { members: 2, amount: 200 });
  assert.equal(brief.totals.coverageRate, 50);
  const june = brief.sixMonthFlow.find((row) => row.month === "2026-06");
  const july = brief.sixMonthFlow.find((row) => row.month === "2026-07");
  assert.deepEqual(june, {
    month: "2026-06",
    paymentCount: 2,
    totalAmount: 120,
    tuitionAmount: 80,
    otherAmount: 40
  });
  assert.deepEqual(july, {
    month: "2026-07",
    paymentCount: 1,
    totalAmount: 100,
    tuitionAmount: 100,
    otherAmount: 0
  });
});

test("finds installments due in the next seven days across a month boundary", () => {
  const members = [
    member("early", "Early Month", "2025-12-02", 90),
    member("last", "Last Day", "2025-12-31", 110)
  ];
  const payments = [
    tuition("early-jan", "early", "2026-01", 90),
    tuition("last-jan", "last", "2026-01", 110)
  ];

  const brief = getOperatorBrief(store(members, payments), [], new Date("2026-01-29T12:00:00"));

  assert.deepEqual(brief.dueNext7Days.map((row) => [row.memberId, row.month, row.dueDate, row.daysUntil]), [
    ["early", "2026-02", "2026-02-02", 4]
  ]);
  assert.equal(brief.totals.next7Days.amount, 90);
});

test("clamps a 31st due day to the last day of February", () => {
  const lastDay = member("last", "Last Day", "2025-12-31", 110);
  const payments = [tuition("last-jan", "last", "2026-01", 110)];

  const brief = getOperatorBrief(store([lastDay], payments), [], new Date("2026-02-24T12:00:00"));

  assert.deepEqual(brief.dueNext7Days.map((row) => [row.month, row.dueDate, row.daysUntil]), [
    ["2026-02", "2026-02-28", 4]
  ]);
});

test("rolls up households without losing each member's independent balance", () => {
  const members = [
    member("a", "Alex Park", "2026-05-01", 100, { householdId: "park", householdName: "Park Family" }),
    member("b", "Bo Park", "2026-06-20", 150, { householdId: "park", householdName: "Park Family" }),
    member("c", "Chris Park", "2026-06-01", 80, { householdId: "park", householdName: "Park Family" }),
    member("d", "Dana Solo", "2026-06-01", 60)
  ];
  const payments = [tuition("chris-june", "c", "2026-06", 80)];

  const brief = getOperatorBrief(store(members, payments), [], new Date("2026-06-18T12:00:00"));

  assert.deepEqual(brief.householdRisk.map((household) => [household.householdName, household.dueNowAmount]), [
    ["Park Family", 200],
    ["Dana Solo", 60]
  ]);
  const park = brief.householdRisk[0];
  assert.equal(park.participantCount, 3);
  assert.equal(park.dueNowInstallments, 2);
  assert.deepEqual(park.rows.map((row) => [row.memberId, row.dueNowAmount]), [
    ["a", 200],
    ["b", 0],
    ["c", 0]
  ]);
});

test("excludes inactive and contact-only records from setup and payment operations", () => {
  const members = [
    member("active", "Active Missing", "", 0),
    member("contact", "Contact Only", "", 0, { participant: false }),
    member("inactive", "Inactive", "", 0, { inactive: true })
  ];

  const brief = getOperatorBrief(store(members), [], new Date("2026-06-18T12:00:00"));

  assert.equal(brief.setupRows.length, 1);
  assert.equal(brief.setupRows[0].memberId, "active");
  assert.deepEqual(brief.setupRows[0].missingFields, ["startDate", "monthlyAmount"]);
  assert.equal(brief.householdRisk.length, 1);
  assert.equal(brief.totals.dueNow.amount, 0);
});

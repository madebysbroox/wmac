import {
  getMemberPaymentState,
  isActiveParticipant
} from "./data.js";

const DAY_MS = 86_400_000;
const LATE_DAYS = 10;

// A read-only operations model for the Home workspace. It deliberately keeps
// provider staging, payment records, and household members separate: pending
// provider records suppress contact for the matching month, but never erase
// the underlying debt facts.
export function getOperatorBrief(store, pendingPayments = [], today = new Date()) {
  const members = (store?.members || []).filter(isActiveParticipant);
  const payments = store?.payments || [];
  const asOf = dateKey(today);
  const currentMonth = asOf.slice(0, 7);
  const pendingItems = (pendingPayments || []).filter(isPendingProviderItem);
  const memberRows = members.map((member) => operatorMemberRow(member, payments, pendingItems, today));
  const validRows = memberRows.filter((row) => !row.setupNeeded);

  const dueRows = validRows.filter((row) => row.dueInstallments.length > 0);
  const behindRows = validRows.filter((row) => row.behindInstallments.length > 0);
  const pendingDueRows = validRows.filter((row) => row.pendingDueInstallments.length > 0);
  const setupRows = memberRows.filter((row) => row.setupNeeded);
  const dueNext7Rows = getDueNext7Rows(members, payments, pendingItems, today);
  const eligibleCurrentMonthRows = validRows.filter((row) => memberStartedByMonth(row.member, currentMonth));
  const eligibleCurrentMonthIds = new Set(eligibleCurrentMonthRows.map((row) => row.member.id));
  const currentMonthTuitionPayments = payments.filter((payment) =>
    isTuitionPayment(payment) && payment.month === currentMonth
  );
  const eligibleCurrentMonthTuitionPayments = currentMonthTuitionPayments.filter((payment) =>
    eligibleCurrentMonthIds.has(payment.memberId)
  );
  const paidCurrentMonthIds = new Set(eligibleCurrentMonthTuitionPayments.map((payment) => payment.memberId));
  const paidCurrentMonthRows = eligibleCurrentMonthRows.filter((row) => paidCurrentMonthIds.has(row.member.id));
  const calendarMonthPayments = payments.filter((payment) => paymentMonthFromPaidAt(payment.paidAt) === currentMonth);
  const sixMonthFlow = recentMonths(currentMonth, 6).map((month) => {
    const monthPayments = payments.filter((payment) => payment.month === month);
    const tuitionPayments = monthPayments.filter(isTuitionPayment);
    const otherPayments = monthPayments.filter((payment) => !isTuitionPayment(payment));
    return {
      month,
      paymentCount: monthPayments.length,
      totalAmount: sum(monthPayments, paymentAmount),
      tuitionAmount: sum(tuitionPayments, paymentAmount),
      otherAmount: sum(otherPayments, paymentAmount)
    };
  });

  const tuitionFollowups = validRows.flatMap(contactQueueItem).sort(compareQueueItems);
  const pendingCards = pendingItems
    .map((payment, index) => providerQueueItem(payment, members, index))
    .sort(comparePendingCards);
  const setupResultRows = setupRows
    .map(setupQueueItem)
    .sort((left, right) => left.name.localeCompare(right.name, "en") || left.memberId.localeCompare(right.memberId, "en"));
  const expectedMembers = eligibleCurrentMonthRows.length;
  const paidMembers = paidCurrentMonthRows.length;
  const expectedAmount = sum(eligibleCurrentMonthRows, (row) => Number(row.member.monthlyAmount || 0));
  const coveredExpectedAmount = sum(paidCurrentMonthRows, (row) => Number(row.member.monthlyAmount || 0));

  return {
    asOf,
    currentMonth,
    tuitionFollowups,
    setupRows: setupResultRows,
    dueNext7Days: dueNext7Rows,
    pendingCards,
    totals: {
      dueNow: {
        members: dueRows.length,
        installments: sum(dueRows, (row) => row.dueInstallments.length),
        amount: sum(dueRows, (row) => row.dueNowAmount),
        pendingMembers: pendingDueRows.length,
        pendingInstallments: sum(pendingDueRows, (row) => row.pendingDueInstallments.length),
        pendingAmount: sum(pendingDueRows, (row) => row.pendingDueAmount)
      },
      behind: {
        members: behindRows.length,
        installments: sum(behindRows, (row) => row.behindInstallments.length),
        amount: sum(behindRows, (row) => row.behindAmount)
      },
      next7Days: {
        members: new Set(dueNext7Rows.map((row) => row.memberId)).size,
        installments: dueNext7Rows.length,
        amount: sum(dueNext7Rows, (row) => row.amount),
        from: shiftDate(asOf, 1),
        through: shiftDate(asOf, 7)
      },
      cashReceivedThisMonth: {
        payments: calendarMonthPayments.length,
        amount: sum(calendarMonthPayments, paymentAmount),
        tuitionAmount: sum(calendarMonthPayments.filter(isTuitionPayment), paymentAmount),
        otherAmount: sum(calendarMonthPayments.filter((payment) => !isTuitionPayment(payment)), paymentAmount)
      },
      serviceMonthCovered: {
        members: paidMembers,
        expectedAmount: coveredExpectedAmount,
        appliedAmount: sum(eligibleCurrentMonthTuitionPayments, paymentAmount)
      },
      serviceMonthExpected: {
        members: expectedMembers,
        amount: expectedAmount
      },
      coverageRate: expectedMembers ? Math.round((paidMembers / expectedMembers) * 100) : 0
    },
    sixMonthFlow,
    householdRisk: householdRollups(memberRows)
  };
}

function operatorMemberRow(member, payments, pendingItems, today) {
  const memberPending = pendingItems.filter((payment) => providerMemberId(payment) === member.id);
  const paymentState = getMemberPaymentState(member, payments, today, memberPending);
  const setupNeeded = Boolean(paymentState.flags?.setupNeeded);
  const dueInstallments = setupNeeded ? [] : paymentState.dueUnpaidMonths;
  const behindInstallments = dueInstallments.filter((month) => month.daysLate >= LATE_DAYS);
  const pendingDueInstallments = dueInstallments.filter((month) => month.pending);
  const actionableInstallments = dueInstallments.filter((month) => !month.pending);
  const monthlyAmount = Number(member.monthlyAmount || 0);
  return {
    member,
    paymentState,
    setupNeeded,
    missingFields: setupNeeded ? missingSetupFields(member) : [],
    dueInstallments,
    behindInstallments,
    pendingDueInstallments,
    actionableInstallments,
    dueNowAmount: dueInstallments.length * monthlyAmount,
    behindAmount: behindInstallments.length * monthlyAmount,
    pendingDueAmount: pendingDueInstallments.length * monthlyAmount
  };
}

function providerQueueItem(payment, members, index) {
  const memberId = providerMemberId(payment);
  const member = members.find((candidate) => candidate.id === memberId);
  const needsMatch = payment.status === "needs_match" || !memberId;
  return {
    id: `card:${payment.id || payment.providerPaymentId || index}`,
    kind: "card_review",
    reason: needsMatch ? "needs_match" : "pending",
    priority: needsMatch ? 0 : 1,
    status: payment.status,
    memberId: member?.id || memberId || "",
    memberName: member?.name || payment.buyerName || "",
    householdName: member?.householdName || "",
    paymentId: payment.id || payment.providerPaymentId || "",
    paymentMonth: providerPaymentMonth(payment),
    paidAt: String(payment.paidAt || payment.createdAt || ""),
    amount: providerAmount(payment),
    daysLate: 0
  };
}

function contactQueueItem(row) {
  if (row.actionableInstallments.length === 0) {
    return [];
  }
  const oldestDaysLate = Math.max(...row.actionableInstallments.map((month) => month.daysLate));
  const reason = oldestDaysLate >= LATE_DAYS
    ? "behind"
    : oldestDaysLate > 0
      ? "past_due"
      : "due_today";
  const priority = reason === "behind" ? 0 : reason === "past_due" ? 1 : 2;
  const monthlyAmount = Number(row.member.monthlyAmount || 0);
  return [{
    id: `contact:${row.member.id}`,
    kind: "member_follow_up",
    reason,
    priority,
    memberId: row.member.id,
    memberName: row.member.name,
    householdName: row.member.householdName || "",
    daysLate: oldestDaysLate,
    actionableMonths: row.actionableInstallments.map((month) => month.month),
    actionableAmount: row.actionableInstallments.length * monthlyAmount,
    debtMonths: row.dueInstallments.map((month) => month.month),
    debtDueNowAmount: row.dueNowAmount,
    pendingMonths: row.pendingDueInstallments.map((month) => month.month),
    pendingDueAmount: row.pendingDueAmount
  }];
}

function setupQueueItem(row) {
  return {
    memberId: row.member.id,
    name: row.member.name,
    householdName: row.member.householdName || "",
    missingFields: row.missingFields,
    knownMonthlyAmount: Number(row.member.monthlyAmount || 0)
  };
}

function compareQueueItems(left, right) {
  return left.priority - right.priority
    || Number(right.daysLate || 0) - Number(left.daysLate || 0)
    || Number(right.actionableAmount ?? right.amount ?? 0) - Number(left.actionableAmount ?? left.amount ?? 0)
    || String(left.memberName || "").localeCompare(String(right.memberName || ""), "en")
    || String(left.id).localeCompare(String(right.id), "en");
}

function comparePendingCards(left, right) {
  return left.priority - right.priority
    || String(left.paidAt || "").localeCompare(String(right.paidAt || ""))
    || String(left.memberName || "").localeCompare(String(right.memberName || ""), "en")
    || String(left.id).localeCompare(String(right.id), "en");
}

function getDueNext7Rows(members, payments, pendingItems, today) {
  const todayKey = dateKey(today);
  const currentMonth = todayKey.slice(0, 7);
  const followingMonth = shiftMonth(currentMonth, 1);
  const paidMemberMonths = new Set(
    payments.filter(isTuitionPayment).map((payment) => `${payment.memberId}:${payment.month}`)
  );

  return members.flatMap((member) => {
    if (missingSetupFields(member).length > 0) {
      return [];
    }
    return [currentMonth, followingMonth].flatMap((month) => {
      if (!memberStartedByMonth(member, month) || paidMemberMonths.has(`${member.id}:${month}`)) {
        return [];
      }
      const dueDate = dueDateForMonth(member, month);
      const daysUntil = daysBetween(todayKey, dueDate);
      if (daysUntil < 1 || daysUntil > 7) {
        return [];
      }
      const memberPending = pendingItems.filter((payment) =>
        providerMemberId(payment) === member.id && providerPaymentMonth(payment) === month
      );
      return [{
        memberId: member.id,
        name: member.name,
        householdName: member.householdName || "",
        month,
        dueDate,
        daysUntil,
        amount: Number(member.monthlyAmount || 0),
        pending: memberPending.length > 0
      }];
    });
  }).sort((left, right) =>
    left.dueDate.localeCompare(right.dueDate)
      || left.name.localeCompare(right.name, "en")
      || left.memberId.localeCompare(right.memberId, "en")
  );
}

function householdRollups(memberRows) {
  const groups = new Map();
  memberRows.forEach((row) => {
    const member = row.member;
    const householdId = member.householdId || householdKey(member.householdName) || `member:${member.id}`;
    const householdName = member.householdName || member.name;
    const group = groups.get(householdId) || {
      householdId,
      householdName,
      participantCount: 0,
      dueNowAmount: 0,
      dueNowInstallments: 0,
      pendingDueAmount: 0,
      oldestDaysLate: 0,
      rows: []
    };
    group.participantCount += 1;
    group.dueNowAmount += row.dueNowAmount;
    group.dueNowInstallments += row.dueInstallments.length;
    group.pendingDueAmount += row.pendingDueAmount;
    const oldestDaysLate = row.setupNeeded ? 0 : row.paymentState.oldestDaysLate || 0;
    group.oldestDaysLate = Math.max(group.oldestDaysLate, oldestDaysLate);
    group.rows.push({
      memberId: member.id,
      name: member.name,
      setupNeeded: row.setupNeeded,
      dueNowAmount: row.dueNowAmount,
      dueNowInstallments: row.dueInstallments.length,
      pendingDueAmount: row.pendingDueAmount,
      pendingMonths: row.pendingDueInstallments.map((month) => month.month),
      oldestDaysLate
    });
    groups.set(householdId, group);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      rows: group.rows.sort((left, right) => left.name.localeCompare(right.name, "en") || left.memberId.localeCompare(right.memberId, "en"))
    }))
    .sort((left, right) =>
      right.dueNowAmount - left.dueNowAmount
        || right.oldestDaysLate - left.oldestDaysLate
        || left.householdName.localeCompare(right.householdName, "en")
        || left.householdId.localeCompare(right.householdId, "en")
    );
}

function missingSetupFields(member) {
  const fields = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(member.startDate || ""))) {
    fields.push("startDate");
  }
  if (Number(member.monthlyAmount || 0) <= 0) {
    fields.push("monthlyAmount");
  }
  return fields;
}

function memberStartedByMonth(member, month) {
  return String(member.startDate || "").slice(0, 7) <= month;
}

function isPendingProviderItem(payment) {
  return payment?.status === "pending" || payment?.status === "needs_match";
}

function providerMemberId(payment) {
  return payment?.memberId || payment?.suggestedMemberId || "";
}

function providerPaymentMonth(payment) {
  const direct = String(payment?.paymentMonth || payment?.month || "");
  if (/^\d{4}-\d{2}$/.test(direct)) {
    return direct;
  }
  return paymentMonthFromPaidAt(payment?.paidAt || payment?.createdAt);
}

function providerAmount(payment) {
  const cents = Number(payment?.amountCents);
  if (Number.isFinite(cents)) {
    return cents / 100;
  }
  return Number(payment?.amount || 0);
}

function isTuitionPayment(payment) {
  return !payment?.category || payment.category === "tuition";
}

function paymentAmount(payment) {
  return Number(payment?.amount || 0);
}

function paymentMonthFromPaidAt(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2})/);
  return match?.[1] || "";
}

function recentMonths(endMonth, count) {
  return Array.from({ length: count }, (_, index) => shiftMonth(endMonth, index - count + 1));
}

function shiftMonth(month, offset) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dueDateForMonth(member, month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const dueDay = Number(String(member.startDate || "").split("-")[2]) || 1;
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(Math.min(dueDay, lastDay)).padStart(2, "0")}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(year, month - 1, day + days);
  return dateKey(shifted);
}

function daysBetween(start, end) {
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  return Math.round((Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / DAY_MS);
}

function householdKey(name) {
  const normalized = String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized ? `household:${normalized}` : "";
}

function sum(items, getter) {
  return items.reduce((total, item) => total + Number(getter(item) || 0), 0);
}

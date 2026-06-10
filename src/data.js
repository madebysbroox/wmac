const MEMBER_FIELD_ALIASES = {
  name: ["name", "member name", "student name", "student", "full name"],
  startDate: ["contract start date", "start date", "joined", "join date", "contract date"],
  monthlyAmount: ["monthly payment amount", "monthly amount", "payment amount", "amount", "tuition", "monthly tuition"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "mobile", "cell"],
  parentName: ["parent/guardian name", "parent name", "guardian", "guardian name", "parent"],
  externalId: ["id", "member id", "student id", "customer id", "square customer id"]
};

const PAYMENT_FIELD_ALIASES = {
  name: ["name", "member name", "student name", "customer name"],
  email: ["email", "email address", "customer email"],
  phone: ["phone", "phone number", "customer phone"],
  externalId: ["id", "member id", "student id", "customer id", "square customer id"],
  amount: ["amount", "payment amount", "total", "gross sales", "net sales"],
  paidAt: ["date", "paid at", "payment date", "transaction date"],
  month: ["month", "payment month", "paid month"]
};

export function createEmptyStore() {
  return {
    version: 1,
    members: [],
    payments: [],
    updatedAt: new Date().toISOString()
  };
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }

  if (rows.length === 0) {
    return { headers: [], records: [] };
  }

  const headers = rows[0].map((header) => header.trim());
  const records = rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });

  return { headers, records };
}

export function toCsv(rows) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCsvCell(row[header] ?? "")).join(","));
  });
  return lines.join("\n");
}

export function guessColumnMap(headers, aliases = MEMBER_FIELD_ALIASES) {
  const normalizedHeaders = headers.map((header) => normalize(header));
  const map = {};

  Object.entries(aliases).forEach(([field, names]) => {
    const exactIndex = normalizedHeaders.findIndex((header) => names.includes(header));
    if (exactIndex >= 0) {
      map[field] = headers[exactIndex];
      return;
    }

    const partialIndex = normalizedHeaders.findIndex((header) =>
      names.some((name) => header.includes(name) || name.includes(header))
    );
    if (partialIndex >= 0) {
      map[field] = headers[partialIndex];
    }
  });

  return map;
}

export function importMembersFromRecords(records, columnMap, existingStore = createEmptyStore()) {
  const membersByKey = new Map(existingStore.members.map((member) => [member.identityKey, member]));
  const imported = [];
  const skipped = [];

  records.forEach((record, index) => {
    const name = clean(record[columnMap.name]);
    if (!name) {
      skipped.push({ row: index + 2, reason: "Missing member name" });
      return;
    }

    const email = clean(record[columnMap.email]).toLowerCase();
    const phone = cleanPhone(record[columnMap.phone]);
    const externalId = clean(record[columnMap.externalId]);
    const identityKey = buildIdentityKey({ externalId, email, phone, name });
    const existing = membersByKey.get(identityKey);
    const member = {
      id: existing?.id ?? cryptoId("mem"),
      identityKey,
      name,
      startDate: normalizeDate(record[columnMap.startDate]) || existing?.startDate || "",
      monthlyAmount: parseMoney(record[columnMap.monthlyAmount]) || existing?.monthlyAmount || 0,
      email: email || existing?.email || "",
      phone: phone || existing?.phone || "",
      parentName: clean(record[columnMap.parentName]) || existing?.parentName || "",
      externalId: externalId || existing?.externalId || "",
      inactive: existing?.inactive ?? false,
      notes: existing?.notes ?? ""
    };

    membersByKey.set(identityKey, member);
    imported.push(member);
  });

  return {
    store: {
      ...existingStore,
      members: Array.from(membersByKey.values()).sort((a, b) => a.name.localeCompare(b.name)),
      updatedAt: new Date().toISOString()
    },
    imported,
    skipped
  };
}

export function importPaymentsFromRecords(records, columnMap, store) {
  const matches = [];
  const unmatched = [];
  const payments = [...store.payments];

  records.forEach((record, index) => {
    const member = findPaymentMember(record, columnMap, store.members);
    const amount = parseMoney(record[columnMap.amount]);
    const month = normalizeMonth(record[columnMap.month]) || monthFromDate(record[columnMap.paidAt]);

    if (!member || !month || !amount) {
      unmatched.push({ row: index + 2, record });
      return;
    }

    const payment = {
      id: cryptoId("pay"),
      memberId: member.id,
      month,
      amount,
      paidAt: normalizeDate(record[columnMap.paidAt]) || new Date().toISOString().slice(0, 10),
      source: "payment-csv"
    };
    payments.push(payment);
    matches.push({ member, payment });
  });

  return {
    store: { ...store, payments, updatedAt: new Date().toISOString() },
    matches,
    unmatched
  };
}

export function findPaymentMember(record, columnMap, members) {
  const externalId = clean(record[columnMap.externalId]);
  const email = clean(record[columnMap.email]).toLowerCase();
  const phone = cleanPhone(record[columnMap.phone]);
  const name = normalize(record[columnMap.name]);

  return members.find((member) =>
    (externalId && member.externalId === externalId) ||
    (email && member.email === email) ||
    (phone && member.phone === phone) ||
    (name && normalize(member.name) === name)
  );
}

export function searchMembers(members, query) {
  const needle = normalize(query);
  const activeMembers = members.filter((member) => !member.inactive);
  if (!needle) {
    return activeMembers.slice(0, 25);
  }
  return activeMembers
    .filter((member) => normalize(member.name).includes(needle))
    .sort((a, b) => normalize(a.name).indexOf(needle) - normalize(b.name).indexOf(needle))
    .slice(0, 25);
}

export function addPayment(store, payment) {
  const nextPayment = {
    id: cryptoId("pay"),
    memberId: payment.memberId,
    month: normalizeMonth(payment.month),
    amount: Number(payment.amount) || 0,
    paidAt: payment.paidAt || new Date().toISOString().slice(0, 10),
    source: payment.source || "manual"
  };

  return {
    ...store,
    payments: [...store.payments.filter((item) => !(item.memberId === nextPayment.memberId && item.month === nextPayment.month)), nextPayment],
    updatedAt: new Date().toISOString()
  };
}

export function upsertMember(store, member) {
  const nextMember = {
    ...member,
    id: member.id || cryptoId("mem"),
    name: clean(member.name),
    email: clean(member.email).toLowerCase(),
    phone: cleanPhone(member.phone),
    monthlyAmount: Number(member.monthlyAmount) || 0
  };
  nextMember.identityKey = buildIdentityKey(nextMember);
  const members = store.members.filter((item) => item.id !== nextMember.id);
  members.push(nextMember);
  return { ...store, members: members.sort((a, b) => a.name.localeCompare(b.name)), updatedAt: new Date().toISOString() };
}

export function getMemberStatus(member, payments, today = new Date()) {
  const currentMonth = monthKey(today);
  const paidMonths = new Set(payments.filter((payment) => payment.memberId === member.id).map((payment) => payment.month));
  const recentMonths = lastMonths(currentMonth, 4);
  const lastPaidMonth = Array.from(paidMonths).sort().at(-1) || "";
  const unpaidRecent = recentMonths.filter((month) => !paidMonths.has(month));
  const firstDueMonth = member.startDate?.slice(0, 7) || currentMonth;
  const monthsBehind = paidMonths.has(currentMonth)
    ? 0
    : lastPaidMonth
      ? countMonthsBetween(lastPaidMonth, currentMonth)
      : countMonthsBetween(firstDueMonth, currentMonth) + 1;

  let level = "paid";
  let label = "Paid up";
  if (!paidMonths.has(currentMonth)) {
    if (monthsBehind >= 3 || (lastPaidMonth && unpaidRecent.length >= 3)) {
      level = "late";
      label = "Behind";
    } else {
      level = "watch";
      label = "Needs attention";
    }
  }

  return {
    level,
    label,
    currentMonth,
    lastPaidMonth,
    recentMonths: recentMonths.map((month) => ({ month, paid: paidMonths.has(month) })),
    paidMonths
  };
}

export function getUnpaidMonths(member, payments, today = new Date()) {
  const currentMonth = monthKey(today);
  const firstDueMonth = member.startDate?.slice(0, 7) || currentMonth;
  const paidMonths = new Set(payments.filter((payment) => payment.memberId === member.id).map((payment) => payment.month));
  return monthsInRange(firstDueMonth, currentMonth).filter((month) => !paidMonths.has(month));
}

export function getMemberBalance(member, payments, today = new Date()) {
  const unpaidMonths = getUnpaidMonths(member, payments, today);
  const monthlyAmount = Number(member.monthlyAmount || 0);
  return {
    unpaidMonths,
    monthlyAmount,
    totalDue: unpaidMonths.length * monthlyAmount
  };
}

// Payments are due on the 1st. Once a payment is 10 or more days late it
// picks up a one-time fee of 5% or $5, whichever is greater.
export const LATE_FEE_GRACE_DAYS = 10;
export const LATE_FEE_RATE = 0.05;
export const LATE_FEE_MINIMUM = 5;

export function getLateFeeBalance(member, payments, today = new Date()) {
  const { unpaidMonths, monthlyAmount } = getMemberBalance(member, payments, today);
  const lines = unpaidMonths.map((month) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const dueDate = new Date(year, monthNumber - 1, 1);
    const daysLate = Math.floor((today - dueDate) / 86400000);
    const lateFee = daysLate >= LATE_FEE_GRACE_DAYS
      ? Math.max(LATE_FEE_MINIMUM, Math.round(monthlyAmount * LATE_FEE_RATE * 100) / 100)
      : 0;
    return { month, amount: monthlyAmount, daysLate, lateFee, total: monthlyAmount + lateFee };
  });

  const baseDue = lines.reduce((sum, line) => sum + line.amount, 0);
  const feeDue = lines.reduce((sum, line) => sum + line.lateFee, 0);
  return { monthlyAmount, lines, baseDue, feeDue, totalDue: baseDue + feeDue };
}

export function exportStoreRows(store) {
  const rows = [];
  store.members.forEach((member) => {
    const memberPayments = store.payments.filter((payment) => payment.memberId === member.id);
    if (memberPayments.length === 0) {
      rows.push(memberRow(member, null));
      return;
    }
    memberPayments.forEach((payment) => rows.push(memberRow(member, payment)));
  });
  return rows;
}

// Totals are grouped by the month each payment was for (the "2026-06" key),
// so back-entered history lands in the right year.
export function getYearRevenue(store, year) {
  const inYear = store.payments.filter((payment) => String(payment.month).startsWith(`${year}-`));
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const monthPayments = inYear.filter((payment) => payment.month === month);
    return {
      month,
      count: monthPayments.length,
      total: monthPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    };
  });

  const namesById = new Map(store.members.map((member) => [member.id, member.name]));
  const byMemberMap = new Map();
  inYear.forEach((payment) => {
    const entry = byMemberMap.get(payment.memberId) || { memberId: payment.memberId, count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(payment.amount || 0);
    byMemberMap.set(payment.memberId, entry);
  });
  const byMember = Array.from(byMemberMap.values())
    .map((entry) => ({ ...entry, name: namesById.get(entry.memberId) || "Unknown member" }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return {
    year,
    totalRevenue: monthly.reduce((sum, row) => sum + row.total, 0),
    paymentCount: inYear.length,
    monthly,
    byMember
  };
}

// A clean roster of active members, with headers the member import recognizes,
// ready to start a new year.
export function exportRosterRows(store) {
  return store.members
    .filter((member) => !member.inactive)
    .map((member) => ({
      "Member Name": member.name,
      "Contract Start Date": member.startDate || "",
      "Monthly Amount": moneyText(member.monthlyAmount),
      Email: member.email || "",
      Phone: member.phone || "",
      "Parent/Guardian Name": member.parentName || "",
      "Member ID": member.externalId || ""
    }));
}

export { MEMBER_FIELD_ALIASES, PAYMENT_FIELD_ALIASES };

function memberRow(member, payment) {
  return {
    "Member Name": member.name,
    "Contract Start Date": member.startDate || "",
    "Monthly Amount": moneyText(member.monthlyAmount),
    Email: member.email || "",
    Phone: member.phone || "",
    "Parent/Guardian": member.parentName || "",
    "Member ID": member.externalId || "",
    Inactive: member.inactive ? "yes" : "no",
    "Payment Month": payment?.month || "",
    "Payment Amount": payment ? moneyText(payment.amount) : "",
    "Paid Date": payment?.paidAt || "",
    "Payment Source": payment?.source || ""
  };
}

function escapeCsvCell(value) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function clean(value) {
  return String(value ?? "").trim();
}

function cleanPhone(value) {
  return clean(value).replace(/\D/g, "");
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseMoney(value) {
  const amount = Number(clean(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeDate(value) {
  const text = clean(value);
  if (!text) {
    return "";
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function normalizeMonth(value) {
  const text = clean(value);
  if (/^\d{4}-\d{2}$/.test(text)) {
    return text;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return monthKey(date);
}

function monthFromDate(value) {
  const date = new Date(clean(value));
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return monthKey(date);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function lastMonths(currentMonth, count) {
  const [year, month] = currentMonth.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return Array.from({ length: count }, (_, index) => {
    const item = new Date(date);
    item.setMonth(date.getMonth() - index);
    return monthKey(item);
  }).reverse();
}

function monthsInRange(startMonth, endMonth) {
  if (!startMonth || !endMonth) {
    return [];
  }
  const [startYear, start] = startMonth.split("-").map(Number);
  const [endYear, end] = endMonth.split("-").map(Number);
  if (![startYear, start, endYear, end].every(Number.isFinite)) {
    return [];
  }

  const months = [];
  const date = new Date(startYear, start - 1, 1);
  const endDate = new Date(endYear, end - 1, 1);
  while (date <= endDate) {
    months.push(monthKey(date));
    date.setMonth(date.getMonth() + 1);
  }
  return months;
}

function countMonthsBetween(startMonth, endMonth) {
  if (!startMonth || !endMonth) {
    return 0;
  }
  const [startYear, start] = startMonth.split("-").map(Number);
  const [endYear, end] = endMonth.split("-").map(Number);
  return Math.max(0, (endYear - startYear) * 12 + (end - start));
}

function buildIdentityKey(member) {
  if (member.externalId) {
    return `id:${member.externalId}`;
  }
  if (member.email) {
    return `email:${member.email}`;
  }
  if (member.phone) {
    return `phone:${member.phone}`;
  }
  return `name:${normalize(member.name)}`;
}

function cryptoId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function moneyText(value) {
  return Number(value || 0).toFixed(2);
}

import {
  nextMemberCertification,
  normalizeMemberCertifications,
  primaryCertificationLabel
} from "./certification.js";

const MEMBER_FIELD_ALIASES = {
  name: ["name", "member name", "student name", "student", "full name"],
  startDate: ["contract start date", "start date", "joined", "join date", "contract date"],
  monthlyAmount: ["monthly payment amount", "monthly amount", "payment amount", "amount", "tuition", "monthly tuition"],
  lateFeeMinimum: ["late fee minimum", "minimum late fee", "late charge minimum", "minimum late charge"],
  lateFeePercentage: ["late fee percentage", "late fee percent", "late charge percentage", "late charge percent"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "mobile", "cell"],
  homePhone: ["home phone", "home phone number"],
  workPhone: ["work phone", "work phone number", "business phone"],
  cellPhone: ["cell phone", "cell phone number", "mobile phone"],
  address: ["address", "street address", "mailing address"],
  city: ["city"],
  state: ["state", "st"],
  zip: ["zip", "zip code", "postal code"],
  dob: ["dob", "date of birth", "birth date"],
  agreementType: ["agreement type", "contract type", "membership type"],
  agreementEndDate: ["agreement expiration date", "agreement end date", "contract end date", "contract expiration date"],
  emailConsent: ["email consent", "contractual email consent"],
  textConsent: ["text consent", "sms consent", "contractual text consent"],
  phoneConsent: ["phone consent", "call consent", "contractual phone consent"],
  downPayment: ["down payment"],
  parentName: ["parent/guardian name", "parent name", "guardian", "guardian name", "parent"],
  responsiblePartyId: ["responsible party id", "billing responsible party", "contract signer id", "payer id"],
  externalId: ["id", "member id", "student id", "customer id"],
  squareCustomerId: ["square customer id", "square customer", "square id"],
  householdName: ["household", "household name", "family", "family name"],
  householdRole: ["household role", "family role", "person type", "role"],
  participant: ["participant", "student", "takes classes", "participates"],
  programs: ["programs", "program", "classes", "martial arts"],
  beltLevel: ["belt", "belt level", "current belt", "current level", "level"],
  nextLevel: ["next belt", "next level", "next goal", "promotion goal"],
  taeKwonDoCertification: ["tae kwon do certification", "taekwondo certification", "tae kwon do level", "tkd level"],
  muayThaiCertification: ["muay thai certification", "muay thai level"]
};

export const CURRENT_STORE_VERSION = 3;
export const CONTRACT_DOWN_PAYMENT_SOURCE = "contract-down-payment";

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
    version: CURRENT_STORE_VERSION,
    members: [],
    payments: [],
    updatedAt: new Date().toISOString()
  };
}

export function createEmptySquareStore() {
  return {
    version: 1,
    payments: [],
    updatedAt: new Date().toISOString()
  };
}

export function createEmptyProviderPaymentStore() {
  return createEmptySquareStore();
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

// Re-import friendly: each row is matched to an existing member by ID, email,
// phone, or name (in that order). Matched rows fill in blanks and update
// changed details without touching payment history; unmatched rows are added.
export function importMembersFromRecords(records, columnMap, existingStore = createEmptyStore()) {
  const members = [...existingStore.members];
  const imported = [];
  const added = [];
  const updated = [];
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
    const existing = members.find((member) =>
      (externalId && member.externalId === externalId) ||
      (email && member.email === email) ||
      (phone && member.phone === phone) ||
      normalize(member.name) === normalize(name)
    );

    const startDate = normalizeDate(record[columnMap.startDate]) || existing?.startDate || "";
    const importedCellPhone = cleanPhone(record[columnMap.cellPhone]) || cleanPhone(record[columnMap.phone]);
    const agreementEndDate = normalizeDate(record[columnMap.agreementEndDate])
      || existing?.agreementEndDate
      || defaultAgreementEndDate(startDate);
    const member = {
      id: existing?.id ?? cryptoId("mem"),
      name,
      startDate,
      monthlyAmount: parseMoney(record[columnMap.monthlyAmount]) || existing?.monthlyAmount || 0,
      lateFeeMinimum: clean(record[columnMap.lateFeeMinimum]) === ""
        ? getLateFeeMinimum(existing)
        : normalizeLateFeeMinimum(record[columnMap.lateFeeMinimum]),
      lateFeePercentage: clean(record[columnMap.lateFeePercentage]) === ""
        ? getLateFeePercentage(existing)
        : normalizeLateFeePercentage(record[columnMap.lateFeePercentage]),
      email: email || existing?.email || "",
      phone: importedCellPhone || phone || existing?.cellPhone || existing?.phone || "",
      homePhone: cleanPhone(record[columnMap.homePhone]) || existing?.homePhone || "",
      workPhone: cleanPhone(record[columnMap.workPhone]) || existing?.workPhone || "",
      cellPhone: importedCellPhone || existing?.cellPhone || phone || existing?.phone || "",
      address: clean(record[columnMap.address]) || existing?.address || "",
      city: clean(record[columnMap.city]) || existing?.city || "",
      state: clean(record[columnMap.state]).toUpperCase() || existing?.state || "",
      zip: clean(record[columnMap.zip]) || existing?.zip || "",
      dob: normalizeDate(record[columnMap.dob]) || existing?.dob || "",
      agreementType: normalizeAgreementType(record[columnMap.agreementType]) || existing?.agreementType || "Contract",
      agreementEndDate,
      emailConsent: normalizeConsent(record[columnMap.emailConsent]) || existing?.emailConsent || "No",
      textConsent: normalizeConsent(record[columnMap.textConsent]) || existing?.textConsent || "No",
      phoneConsent: normalizeConsent(record[columnMap.phoneConsent]) || existing?.phoneConsent || "No",
      downPayment: clean(record[columnMap.downPayment]) === "" ? (existing?.downPayment ?? "") : parseMoney(record[columnMap.downPayment]),
      parentName: clean(record[columnMap.parentName]) || existing?.parentName || "",
      responsiblePartyId: clean(record[columnMap.responsiblePartyId]) || existing?.responsiblePartyId || "",
      externalId: externalId || existing?.externalId || "",
      squareCustomerId: clean(record[columnMap.squareCustomerId]) || existing?.squareCustomerId || "",
      householdName: clean(record[columnMap.householdName]) || existing?.householdName || "",
      householdRole: normalizeHouseholdRole(record[columnMap.householdRole]) || existing?.householdRole || (clean(record[columnMap.parentName]) ? "child" : "adult"),
      participant: parseParticipant(record[columnMap.participant], existing?.participant),
      programs: normalizePrograms(record[columnMap.programs] || existing?.programs),
      beltLevel: clean(record[columnMap.beltLevel]) || existing?.beltLevel || "",
      nextLevel: clean(record[columnMap.nextLevel]) || existing?.nextLevel || "",
      inactive: existing?.inactive ?? false,
      notes: existing?.notes ?? ""
    };
    member.certifications = normalizeMemberCertifications({
      ...member,
      certifications: {
        ...(existing?.certifications || {}),
        tae_kwon_do: clean(record[columnMap.taeKwonDoCertification]) || existing?.certifications?.tae_kwon_do || "",
        muay_thai: clean(record[columnMap.muayThaiCertification]) || existing?.certifications?.muay_thai || ""
      }
    });
    member.beltLevel = primaryCertificationLabel(member);
    member.nextLevel = nextMemberCertification(member) || member.nextLevel;
    member.householdId = existing?.householdId || householdIdFor(member.householdName);
    member.identityKey = buildIdentityKey(member);

    if (existing) {
      members[members.indexOf(existing)] = member;
      updated.push(member);
    } else {
      members.push(member);
      added.push(member);
    }
    imported.push(member);
  });

  return {
    store: {
      ...existingStore,
      members: sortMembersByAccount(linkResponsibleParties(members)),
      updatedAt: new Date().toISOString()
    },
    imported,
    added,
    updated,
    skipped
  };
}

// Re-import friendly: a month that is already recorded for a member is
// skipped, so importing the same payment file twice never doubles anything.
export function importPaymentsFromRecords(records, columnMap, store) {
  const matches = [];
  const duplicates = [];
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

    if (payments.some((payment) => payment.memberId === member.id && payment.month === month && isTuitionPayment(payment))) {
      duplicates.push({ row: index + 2, member, month });
      return;
    }

    const payment = {
      id: cryptoId("pay"),
      memberId: member.id,
      month,
      amount,
      paidAt: normalizeDate(record[columnMap.paidAt]) || new Date().toISOString().slice(0, 10),
      source: "payment-csv",
      category: "tuition"
    };
    payments.push(payment);
    matches.push({ member, payment });
  });

  return {
    store: { ...store, payments, updatedAt: new Date().toISOString() },
    matches,
    duplicates,
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

export function suggestedPaymentMember(providerPayment, members) {
  const email = clean(providerPayment.buyerEmail).toLowerCase();
  const phone = cleanPhone(providerPayment.buyerPhone);
  const name = normalize(providerPayment.buyerName);
  const customerId = clean(providerPayment.customerId || providerPayment.externalCustomerId);

  return members.find((member) =>
    (customerId && (member.squareCustomerId === customerId || member.externalId === customerId)) ||
    (email && member.email === email) ||
    (phone && member.phone === phone) ||
    (name && normalize(member.name) === name)
  ) || null;
}

export function suggestedSquareMember(squarePayment, members) {
  return suggestedPaymentMember(squarePayment, members);
}

export function stagedPaymentMonth(providerPayment) {
  return normalizeMonth(providerPayment?.paymentMonth) || monthFromDate(providerPayment?.paidAt || providerPayment?.createdAt);
}

export function squarePaymentMonth(squarePayment) {
  return stagedPaymentMonth(squarePayment);
}

export function nextUnpaidTuitionMonth(member, payments, today = new Date(), members = []) {
  const unpaidMonths = getUnpaidMonths(member, payments, today, members);
  return unpaidMonths[0] || monthKey(today);
}

export function pendingStagedPaymentsForMember(providerPayments, member, members = []) {
  const payer = getResponsibleParty(member, members) || member;
  const accountIds = members.length ? accountMembers(members, payer).map((person) => person.id) : [member.id];
  return (providerPayments || []).filter((payment) =>
    payment.status === "pending" &&
    (accountIds.includes(payment.memberId) || accountIds.includes(payment.suggestedMemberId))
  );
}

export function pendingSquarePaymentsForMember(squarePayments, member) {
  return pendingStagedPaymentsForMember(squarePayments, member);
}

export function normalizeProviderPayment(input, members = []) {
  return normalizeSquarePayment(input, members);
}

export function normalizeSquarePayment(input, members = []) {
  const payment = input?.data?.object?.payment || input?.payment || input || {};
  const amount = Number(payment.total_money?.amount ?? payment.amount_money?.amount ?? input?.amountCents ?? 0);
  const buyerEmail = clean(payment.buyer_email_address || payment.buyerEmail || payment.buyerEmailAddress || input?.buyerEmail || input?.buyerEmailAddress).toLowerCase();
  const buyerPhone = cleanPhone(payment.buyer_phone_number || payment.buyerPhone || input?.buyerPhone);
  const buyerName = clean(payment.buyerName || input?.buyerName);
  const squareCreatedAt = payment.created_at || payment.createdAt || payment.squareCreatedAt || input?.squareCreatedAt;
  const squareUpdatedAt = payment.updated_at || payment.updatedAt || payment.squareUpdatedAt || input?.squareUpdatedAt;
  const createdAt = clean(squareCreatedAt || input?.createdAt || input?.receivedAt) || new Date().toISOString();
  const paidAt = normalizeDate(squareCreatedAt || input?.paidAt || input?.createdAt || input?.receivedAt) || new Date().toISOString().slice(0, 10);
  const candidate = {
    provider: "square",
    providerLabel: "Square",
    id: clean(payment.id || input?.paymentId || input?.squarePaymentId || input?.id),
    squarePaymentId: clean(payment.id || input?.paymentId || input?.squarePaymentId || input?.id),
    providerPaymentId: clean(payment.id || input?.paymentId || input?.squarePaymentId || input?.id),
    squareEventId: clean(input?.event_id || input?.eventId),
    providerEventId: clean(input?.event_id || input?.eventId),
    sourceEventType: clean(input?.type || input?.sourceEventType || input?.eventType),
    status: localReviewStatus(input) || "pending",
    squareStatus: clean(input?.squareStatus || payment.status),
    providerStatus: clean(input?.squareStatus || payment.status),
    amountCents: Number.isFinite(amount) ? amount : 0,
    currency: clean(payment.total_money?.currency || payment.amount_money?.currency || input?.currency) || "USD",
    paidAt,
    createdAt,
    updatedAt: clean(squareUpdatedAt || input?.updatedAt || input?.receivedAt) || createdAt,
    buyerName,
    buyerEmail,
    buyerPhone,
    customerId: clean(payment.customer_id || payment.customerId || input?.customerId),
    receiptUrl: clean(payment.receipt_url || payment.receiptUrl || input?.receiptUrl),
    receiptNumber: clean(payment.receipt_number || payment.receiptNumber || input?.receiptNumber),
    locationId: clean(payment.location_id || payment.locationId || input?.locationId),
    orderId: clean(payment.order_id || payment.orderId || input?.orderId),
    note: clean(payment.note || input?.note),
    reviewNote: clean(input?.reviewNote),
    paymentCategory: clean(input?.paymentCategory),
    paymentMonth: normalizeMonth(input?.paymentMonth) || monthFromDate(payment.created_at || payment.createdAt || input?.paidAt || input?.createdAt),
    memberId: clean(input?.memberId),
    suggestedMemberId: clean(input?.suggestedMemberId),
    approvedAt: clean(input?.approvedAt),
    approvedBy: clean(input?.approvedBy),
    ignoredAt: clean(input?.ignoredAt),
    ignoredReason: clean(input?.ignoredReason),
    raw: input?.raw || input
  };

  if (!candidate.id) {
    candidate.id = cryptoId("sqpay");
    candidate.squarePaymentId = candidate.id;
    candidate.providerPaymentId = candidate.id;
  }

  const suggested = candidate.memberId
    ? members.find((member) => member.id === candidate.memberId)
    : suggestedPaymentMember(candidate, members);
  candidate.suggestedMemberId = candidate.suggestedMemberId || suggested?.id || "";
  if (!candidate.memberId && candidate.suggestedMemberId) {
    candidate.memberId = candidate.suggestedMemberId;
  }
  if (candidate.status === "pending" && !candidate.suggestedMemberId) {
    candidate.status = "needs_match";
  }

  return candidate;
}

export function upsertProviderPayment(providerStore, providerPayment) {
  const existing = (providerStore.payments || []).find((payment) =>
    payment.id === providerPayment.id ||
    (providerPayment.squarePaymentId && payment.squarePaymentId === providerPayment.squarePaymentId) ||
    (providerPayment.providerPaymentId && payment.providerPaymentId === providerPayment.providerPaymentId)
  );
  const nextPayment = {
    ...existing,
    ...providerPayment,
    status: existing?.status && ["approved", "ignored"].includes(existing.status) ? existing.status : providerPayment.status,
    approvedAt: existing?.approvedAt || providerPayment.approvedAt || "",
    approvedBy: existing?.approvedBy || providerPayment.approvedBy || "",
    ignoredAt: existing?.ignoredAt || providerPayment.ignoredAt || "",
    ignoredReason: existing?.ignoredReason || providerPayment.ignoredReason || "",
    reviewNote: existing?.reviewNote || providerPayment.reviewNote || "",
    paymentCategory: existing?.paymentCategory || providerPayment.paymentCategory || ""
  };
  const payments = (providerStore.payments || []).filter((payment) =>
    payment.id !== nextPayment.id &&
    (!nextPayment.squarePaymentId || payment.squarePaymentId !== nextPayment.squarePaymentId) &&
    (!nextPayment.providerPaymentId || payment.providerPaymentId !== nextPayment.providerPaymentId)
  );
  payments.push(nextPayment);
  return {
    ...providerStore,
    payments: payments.sort((a, b) => String(b.paidAt || b.createdAt).localeCompare(String(a.paidAt || a.createdAt))),
    updatedAt: new Date().toISOString()
  };
}

export function upsertSquarePayment(squareStore, squarePayment) {
  return upsertProviderPayment(squareStore, squarePayment);
}

export function updateProviderPaymentStatus(providerStore, paymentId, patch) {
  let found = false;
  const payments = (providerStore.payments || []).map((payment) => {
    if (payment.id !== paymentId && payment.squarePaymentId !== paymentId && payment.providerPaymentId !== paymentId) {
      return payment;
    }
    found = true;
    return {
      ...payment,
      ...patch,
      updatedAt: new Date().toISOString()
    };
  });
  return {
    store: {
      ...providerStore,
      payments,
      updatedAt: new Date().toISOString()
    },
    found
  };
}

export function updateSquarePaymentStatus(squareStore, paymentId, patch) {
  return updateProviderPaymentStatus(squareStore, paymentId, patch);
}

export function searchMembers(members, query) {
  const needle = normalize(query);
  const activeMembers = members.filter((member) => !member.inactive);
  if (!needle) {
    return sortMembersByAccount(activeMembers).slice(0, 25);
  }
  const directMatches = activeMembers.filter((member) => {
    const payer = getResponsibleParty(member, members);
    return [member.name, member.parentName, payer?.name]
      .some((value) => normalize(value).includes(needle));
  });
  const accountIds = new Set(directMatches.map((member) => getResponsibleParty(member, members)?.id || member.id));
  return sortMembersByAccount(activeMembers.filter((member) =>
    accountIds.has(getResponsibleParty(member, members)?.id || member.id)
  )).slice(0, 25);
}

export function addPayment(store, payment) {
  const category = payment.category === "one-off" ? "one-off" : "tuition";
  const nextPayment = {
    id: cryptoId("pay"),
    memberId: payment.memberId,
    month: normalizeMonth(payment.month),
    amount: Number(payment.amount) || 0,
    paidAt: payment.paidAt || new Date().toISOString().slice(0, 10),
    source: payment.source || "manual",
    category,
    note: clean(payment.note),
    batchId: clean(payment.batchId),
    squarePaymentId: clean(payment.squarePaymentId),
    providerPaymentId: clean(payment.providerPaymentId || payment.squarePaymentId),
    paymentProvider: clean(payment.paymentProvider || payment.source)
  };
  const existingPayments = store.payments.filter((item) => {
    if (nextPayment.squarePaymentId && item.squarePaymentId === nextPayment.squarePaymentId) {
      return false;
    }
    if (nextPayment.providerPaymentId && item.providerPaymentId === nextPayment.providerPaymentId) {
      return false;
    }
    return !(category === "tuition" && isTuitionPayment(item) && item.memberId === nextPayment.memberId && item.month === nextPayment.month);
  });

  return {
    ...store,
    payments: [...existingPayments, nextPayment],
    updatedAt: new Date().toISOString()
  };
}

export function removePayment(store, memberId, month) {
  const normalizedMonth = normalizeMonth(month);
  if (!memberId || !normalizedMonth) {
    return store;
  }

  return {
    ...store,
    payments: store.payments.filter((payment) => !(isTuitionPayment(payment) && payment.memberId === memberId && payment.month === normalizedMonth)),
    updatedAt: new Date().toISOString()
  };
}

// Records one normal tuition payment for every unpaid billable month through
// today. Individual months remain ordinary payments, so they can be removed
// later with removePayment just like any manually entered payment.
export function bringMemberUpToDate(store, member, today = new Date()) {
  const amount = Number(member?.monthlyAmount || 0);
  if (!member || amount <= 0) {
    return store;
  }

  return getUnpaidMonths(member, store.payments, today).reduce(
    (nextStore, month) => addPayment(nextStore, {
      memberId: member.id,
      month,
      amount,
      source: "manual-catch-up"
    }),
    store
  );
}

export function defaultAgreementEndDate(startDate) {
  const normalized = normalizeDate(startDate);
  if (!normalized) {
    return "";
  }
  const [year, month, day] = normalized.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  return `${year + 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function getAgreementExpirationStatus(member, today = new Date()) {
  if (
    !member ||
    member.inactive ||
    member.participant === false ||
    member.collectionPlacement?.status === "charged_off" ||
    normalizeAgreementType(member.agreementType) === "Month-to-Month"
  ) {
    return { level: "none", expirationDate: "", daysUntil: null };
  }

  const expirationDate = normalizeDate(member.agreementEndDate) || defaultAgreementEndDate(member.startDate);
  if (!expirationDate) {
    return { level: "none", expirationDate: "", daysUntil: null };
  }

  const daysUntil = Math.round((utcDateValue(expirationDate) - utcDateValue(today)) / 86400000);
  const level = daysUntil <= 0 ? "expired" : daysUntil <= 30 ? "expiring" : "active";
  return { level, expirationDate, daysUntil };
}

export function upsertMember(store, member) {
  const certifications = normalizeMemberCertifications(member);
  const startDate = normalizeDate(member.startDate);
  const cellPhone = cleanPhone(member.cellPhone || member.phone);
  const nextMember = {
    ...member,
    id: member.id || cryptoId("mem"),
    name: clean(member.name),
    email: clean(member.email).toLowerCase(),
    phone: cellPhone,
    homePhone: cleanPhone(member.homePhone),
    workPhone: cleanPhone(member.workPhone),
    cellPhone,
    address: clean(member.address),
    city: clean(member.city),
    state: clean(member.state).toUpperCase(),
    zip: clean(member.zip),
    dob: normalizeDate(member.dob),
    startDate,
    agreementType: normalizeAgreementType(member.agreementType) || "Contract",
    agreementEndDate: normalizeDate(member.agreementEndDate) || defaultAgreementEndDate(startDate),
    emailConsent: normalizeConsent(member.emailConsent) || "No",
    textConsent: normalizeConsent(member.textConsent) || "No",
    phoneConsent: normalizeConsent(member.phoneConsent) || "No",
    downPayment: clean(member.downPayment) === "" ? "" : Number(member.downPayment) || 0,
    responsiblePartyId: clean(member.responsiblePartyId),
    monthlyAmount: Number(member.monthlyAmount) || 0,
    lateFeeMinimum: getLateFeeMinimum(member),
    lateFeePercentage: getLateFeePercentage(member),
    participant: member.participant !== false,
    householdRole: normalizeHouseholdRole(member.householdRole) || "adult",
    householdName: clean(member.householdName),
    householdId: member.householdId || householdIdFor(member.householdName),
    programs: normalizePrograms(member.programs),
    certifications,
    beltLevel: primaryCertificationLabel({ ...member, certifications }),
    nextLevel: nextMemberCertification({ ...member, certifications }) || clean(member.nextLevel),
    squareCustomerId: clean(member.squareCustomerId)
  };
  nextMember.identityKey = buildIdentityKey(nextMember);
  const members = store.members.filter((item) => item.id !== nextMember.id);
  members.push(nextMember);
  return {
    ...store,
    members: sortMembersByAccount(linkResponsibleParties(members)),
    updatedAt: new Date().toISOString()
  };
}

export function migrateStore(store) {
  if (!store?.members || !store?.payments) {
    return createEmptyStore();
  }
  const sourceVersion = Number(store.version || 1);
  if (sourceVersion >= 2) {
    return {
      ...store,
      version: CURRENT_STORE_VERSION,
      members: store.members.map((member) => ({ ...member })),
      payments: store.payments.map((payment) => ({ ...payment }))
    };
  }
  return {
    ...store,
    version: CURRENT_STORE_VERSION,
    members: linkResponsibleParties(store.members.map((member) => {
      const certifications = normalizeMemberCertifications(member);
      return {
        ...member,
        phone: cleanPhone(member.cellPhone || member.phone),
        homePhone: cleanPhone(member.homePhone),
        workPhone: cleanPhone(member.workPhone),
        cellPhone: cleanPhone(member.cellPhone || member.phone),
        address: clean(member.address),
        city: clean(member.city),
        state: clean(member.state).toUpperCase(),
        zip: clean(member.zip),
        dob: normalizeDate(member.dob),
        agreementType: normalizeAgreementType(member.agreementType) || "Contract",
        agreementEndDate: normalizeDate(member.agreementEndDate) || defaultAgreementEndDate(member.startDate),
        emailConsent: normalizeConsent(member.emailConsent) || "No",
        textConsent: normalizeConsent(member.textConsent) || "No",
        phoneConsent: normalizeConsent(member.phoneConsent) || "No",
        downPayment: clean(member.downPayment) === "" ? "" : Number(member.downPayment) || 0,
        responsiblePartyId: clean(member.responsiblePartyId),
        householdName: clean(member.householdName),
        householdId: member.householdId || householdIdFor(member.householdName),
        householdRole: normalizeHouseholdRole(member.householdRole) || (clean(member.parentName) ? "child" : "adult"),
        lateFeeMinimum: getLateFeeMinimum(member),
        lateFeePercentage: getLateFeePercentage(member),
        certifications,
        beltLevel: primaryCertificationLabel({ ...member, certifications }),
        nextLevel: nextMemberCertification({ ...member, certifications }) || member.nextLevel || ""
      };
    }))
  };
}

export function prepareStoreForLoad(store) {
  const sourceVersion = Number(store?.version || 1);
  return {
    store: migrateStore(store),
    needsBackup: Boolean(store?.members && store?.payments && sourceVersion < CURRENT_STORE_VERSION),
    sourceVersion,
    targetVersion: CURRENT_STORE_VERSION
  };
}

export function getContractDownPaymentRecord(store, memberId) {
  return (store?.payments || []).find((payment) =>
    payment.memberId === memberId && payment.source === CONTRACT_DOWN_PAYMENT_SOURCE
  ) || null;
}

// Recording money is always explicit. Loading, importing, and editing a member
// never call this function.
export function recordContractDownPayment(store, memberId) {
  const member = (store?.members || []).find((candidate) => candidate.id === memberId);
  if (!member) {
    throw new Error("Member not found.");
  }
  const payer = getResponsibleParty(member, store.members) || member;
  if (payer.id !== member.id) {
    throw new Error("Record the down payment on the responsible payer.");
  }
  const amount = Number(member.downPayment || 0);
  const contractDate = normalizeDate(member.startDate);
  if (amount <= 0) {
    throw new Error("Enter the contract down-payment amount first.");
  }
  if (!contractDate) {
    throw new Error("Enter the contract signing date first.");
  }

  const existing = getContractDownPaymentRecord(store, member.id);
  const payment = {
    id: existing?.id || cryptoId("pay"),
    memberId: member.id,
    amount,
    month: contractDate.slice(0, 7),
    paidAt: contractDate,
    source: CONTRACT_DOWN_PAYMENT_SOURCE,
    category: "down_payment",
    note: "Contract down payment paid at signing"
  };
  const unchanged = existing
    && existing.amount === payment.amount
    && existing.month === payment.month
    && existing.paidAt === payment.paidAt
    && existing.category === payment.category;
  if (unchanged) {
    return { store, payment: existing, changed: false };
  }
  return {
    store: {
      ...store,
      payments: [...store.payments.filter((item) =>
        !(item.memberId === member.id && item.source === CONTRACT_DOWN_PAYMENT_SOURCE)
      ), payment],
      updatedAt: new Date().toISOString()
    },
    payment,
    changed: true
  };
}

function notBilledPaymentState(member, currentMonth, label = "Covered by payer") {
  return {
    level: "paid",
    label: member?.inactive ? "Inactive" : label,
    currentMonth,
    lastPaidMonth: "",
    recentMonths: [],
    billableMonths: [],
    paidMonths: new Set(),
    prepaidMonths: new Set(),
    unpaidMonths: [],
    dueUnpaidMonths: [],
    upcomingUnpaidMonths: [],
    months: [],
    oldestDaysLate: 0,
    flags: { pending: false, setupNeeded: false }
  };
}

function billingAccount(member, members = []) {
  const allMembers = Array.isArray(members) ? members : [];
  if (!allMembers.length) {
    return { payer: member, billingMember: member, accountMemberIds: [member?.id], isPayer: true };
  }
  const payer = getResponsibleParty(member, allMembers) || member;
  const isPayer = payer?.id === member?.id;
  const contributors = accountMembers(allMembers, payer).filter(isActiveParticipant);
  const monthlyAmount = contributors.reduce((sum, person) => sum + Number(person.monthlyAmount || 0), 0);
  return {
    payer,
    isPayer,
    accountMemberIds: accountMembers(allMembers, payer).map((person) => person.id),
    billingMember: {
      ...payer,
      participant: contributors.length > 0,
      inactive: false,
      monthlyAmount,
      // The payer's contract signing date is the single household billing
      // date. Dependents may have their own enrollment dates, but they never
      // change when the payer's monthly tuition is due.
      startDate: isIsoDate(payer?.startDate) ? payer.startDate : ""
    }
  };
}

export function getMemberPaymentState(member, payments, today = new Date(), pendingPayments = [], members = []) {
  const currentMonth = monthKey(today);
  const account = billingAccount(member, members);
  if (!account.isPayer) {
    return notBilledPaymentState(member, currentMonth);
  }
  const billingMember = account.billingMember;
  if (billingMember.participant === false || billingMember.inactive) {
    return notBilledPaymentState(billingMember, currentMonth, "Non-participant");
  }
  const billableMonths = billingMonthsForAgreement(billingMember, currentMonth);
  const prepaidMonths = prepaidContractMonths(billingMember, billableMonths);
  const paidByMonth = new Map();
  payments.filter((payment) => account.accountMemberIds.includes(payment.memberId) && isTuitionPayment(payment)).forEach((payment) => {
    paidByMonth.set(payment.month, (paidByMonth.get(payment.month) || 0) + Number(payment.amount || 0));
  });
  const paidMonths = new Set([...paidByMonth]
    .filter(([, amount]) => amount + 0.005 >= Number(billingMember.monthlyAmount || 0))
    .map(([month]) => month));
  const pendingMonths = new Set((pendingPayments || [])
    .filter((payment) => payment.status === "pending" || payment.status === "needs_match")
    .map((payment) => normalizeMonth(payment.paymentMonth || payment.month || payment.paidAt))
    .filter(Boolean));
  const todayUtc = utcDateValue(today);
  const months = billableMonths.map((month) => {
    const dueDate = dueDateForMonth(billingMember, month);
    const daysLate = Math.floor((todayUtc - utcDateValue(dueDate)) / 86400000);
    const prepaid = prepaidMonths.has(month);
    const paid = prepaid || paidMonths.has(month);
    const pending = !paid && pendingMonths.has(month);
    let state = "upcoming";
    if (paid) {
      state = "paid";
    } else if (pending) {
      state = "pending";
    } else if (daysLate >= LATE_FEE_GRACE_DAYS) {
      state = "behind";
    } else if (daysLate >= 0) {
      state = "attention";
    }
    return { month, dueDate, daysLate, paid, prepaid, pending, state };
  });
  const recentMonths = billableMonths.slice(-4);
  const allPaidMonths = new Set([...paidMonths, ...prepaidMonths]);
  const lastPaidMonth = Array.from(allPaidMonths).sort().at(-1) || "";
  const unpaidMonths = months.filter((month) => !month.paid).map((month) => month.month);
  const dueUnpaidMonths = months.filter((month) => !month.paid && month.daysLate >= 0);
  const upcomingUnpaidMonths = months.filter((month) => !month.paid && month.daysLate < 0);

  let level = "paid";
  let label = "Paid up";
  if (dueUnpaidMonths.some((month) => month.daysLate >= LATE_FEE_GRACE_DAYS)) {
    level = "late";
    label = "Behind";
  } else if (dueUnpaidMonths.length > 0) {
    level = "watch";
    label = "Needs attention";
  }
  const setupNeeded = !isIsoDate(billingMember.startDate) || Number(billingMember.monthlyAmount || 0) <= 0;
  if (setupNeeded) {
    level = "watch";
    label = "Needs information";
  }

  return {
    level,
    label,
    currentMonth,
    lastPaidMonth,
    recentMonths: recentMonths.map((month) => ({ month, paid: allPaidMonths.has(month), prepaid: prepaidMonths.has(month) })),
    billableMonths,
    paidMonths: allPaidMonths,
    prepaidMonths,
    unpaidMonths,
    dueUnpaidMonths,
    upcomingUnpaidMonths,
    months,
    oldestDaysLate: dueUnpaidMonths.reduce((maximum, month) => Math.max(maximum, month.daysLate), 0),
    flags: {
      pending: pendingMonths.size > 0,
      setupNeeded
    }
  };
}

export function getMemberStatus(member, payments, today = new Date(), members = []) {
  return getMemberPaymentState(member, payments, today, [], members);
}

export function getUnpaidMonths(member, payments, today = new Date(), members = []) {
  return getMemberPaymentState(member, payments, today, [], members).unpaidMonths;
}

export function getMemberBalance(member, payments, today = new Date(), members = []) {
  const account = billingAccount(member, members);
  const state = getMemberPaymentState(member, payments, today, [], members);
  const unpaidMonths = state.unpaidMonths;
  const monthlyAmount = Number(account.billingMember?.monthlyAmount || 0);
  return {
    unpaidMonths,
    dueUnpaidMonths: state.dueUnpaidMonths.map((month) => month.month),
    upcomingUnpaidMonths: state.upcomingUnpaidMonths.map((month) => month.month),
    monthlyAmount,
    totalDue: unpaidMonths.length * monthlyAmount,
    dueNow: state.dueUnpaidMonths.length * monthlyAmount
  };
}

export function getAttentionRows(store, pendingPayments = [], today = new Date()) {
  return store.members
    .filter((member) => isBillingPayer(member, store.members))
    .map((member) => {
      const pending = pendingPaymentsFor(member, pendingPayments, store.members);
      const paymentState = getMemberPaymentState(member, store.payments, today, pending, store.members);
      const balance = getMemberBalance(member, store.payments, today, store.members);
      return { member, paymentState, balance, pending };
    })
    .filter((row) => row.paymentState.dueUnpaidMonths.length > 0 && !row.paymentState.flags.setupNeeded)
    .sort((a, b) => b.paymentState.oldestDaysLate - a.paymentState.oldestDaysLate || b.balance.dueNow - a.balance.dueNow || a.member.name.localeCompare(b.member.name));
}

export function getLandscapeRows(store, pendingPayments = [], today = new Date(), monthCount = 12) {
  const currentMonth = monthKey(today);
  const firstMonth = shiftMonth(currentMonth, -(Math.max(1, monthCount) - 1));
  const visibleMonths = monthsInRange(firstMonth, currentMonth);
  const rows = store.members.filter((member) => isBillingPayer(member, store.members)).map((member) => {
    const pending = pendingPaymentsFor(member, pendingPayments, store.members);
    const paymentState = getMemberPaymentState(member, store.payments, today, pending, store.members);
    const stateByMonth = new Map(paymentState.months.map((month) => [month.month, month]));
    const cells = visibleMonths.map((month) => ({
      month,
      state: paymentState.flags.setupNeeded ? "not_billable" : stateByMonth.get(month)?.state || "not_billable"
    }));
    return {
      member,
      paymentState,
      balance: getMemberBalance(member, store.payments, today, store.members),
      certification: primaryCertificationLabel(member),
      dueDay: Number(paymentState.months[0]?.dueDate?.split("-")[2]) || (isIsoDate(member.startDate) ? Number(member.startDate.split("-")[2]) : null),
      cells
    };
  });
  return { months: visibleMonths, rows };
}

export function reconcileDuePayments(store, member, stillMissingMonths = [], today = new Date()) {
  const payer = getResponsibleParty(member, store.members) || member;
  const keepMissing = new Set(stillMissingMonths.map(normalizeMonth).filter(Boolean));
  const dueMonths = getMemberPaymentState(payer, store.payments, today, [], store.members).dueUnpaidMonths.map((month) => month.month);
  const amount = getMemberBalance(payer, store.payments, today, store.members).monthlyAmount;
  const monthsToPay = dueMonths.filter((month) => !keepMissing.has(month));
  const batchId = cryptoId("batch");
  let nextStore = store;
  const paymentIds = [];
  monthsToPay.forEach((month) => {
    nextStore = addPayment(nextStore, {
      memberId: payer.id,
      month,
      amount,
      source: "attention-review",
      batchId
    });
    const payment = nextStore.payments.find((item) => item.memberId === payer.id && item.month === month && item.batchId === batchId);
    if (payment) {
      paymentIds.push(payment.id);
    }
  });
  return { store: nextStore, batch: { id: batchId, memberId: payer.id, months: monthsToPay, paymentIds } };
}

export function undoPaymentBatch(store, batch) {
  const paymentIds = new Set(batch?.paymentIds || []);
  if (paymentIds.size === 0 && !batch?.id) {
    return store;
  }
  return {
    ...store,
    payments: store.payments.filter((payment) => !paymentIds.has(payment.id) && payment.batchId !== batch.id),
    updatedAt: new Date().toISOString()
  };
}

export function getDashboardSummary(store, today = new Date()) {
  const currentMonth = monthKey(today);
  const currentYear = String(today.getFullYear());
  const activeMembers = store.members.filter(isActiveParticipant);
  const nonParticipantContacts = store.members.filter((member) => !member.inactive && member.participant === false);
  const payments = store.payments || [];

  const paidThisMonth = payments
    .filter((payment) => payment.month === currentMonth)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const paidThisYear = payments
    .filter((payment) => String(payment.month || "").startsWith(`${currentYear}-`))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  const billingMembers = store.members.filter((member) => isBillingPayer(member, store.members));
  const rows = billingMembers.map((member) => {
    const status = getMemberStatus(member, payments, today, store.members);
    const balance = getMemberBalance(member, payments, today, store.members);
    const lateFeeBalance = getLateFeeBalance(member, payments, today, store.members);
    const overdueLines = lateFeeBalance.lines.filter((line) => line.daysLate > 0);
    const tenDaysLateLines = lateFeeBalance.lines.filter((line) => line.daysLate >= LATE_FEE_GRACE_DAYS);
    const olderTenDaysLateLines = tenDaysLateLines.filter((line) => line.month < currentMonth);
    const paidMonths = status.paidMonths;
    const currentMonthUnpaid = balance.unpaidMonths.includes(currentMonth) && !paidMonths.has(currentMonth);
    const currentMonthLine = lateFeeBalance.lines.find((line) => line.month === currentMonth);
    const currentMonthAlreadyLate = Number(currentMonthLine?.daysLate || 0) >= LATE_FEE_GRACE_DAYS;
    const hasDelinquentPayment = olderTenDaysLateLines.length > 0 && !status.flags?.setupNeeded;
    return {
      member,
      status,
      balance,
      overdueDue: overdueLines.reduce((sum, line) => sum + line.amount, 0),
      tenDaysLateDue: tenDaysLateLines.reduce((sum, line) => sum + line.amount, 0),
      currentMonthUnpaidAmount: currentMonthUnpaid && !currentMonthAlreadyLate ? balance.monthlyAmount : 0,
      hasDelinquentPayment
    };
  });

  const delinquentRows = rows.filter((row) => row.hasDelinquentPayment);
  const upToDateExpectedRows = rows.filter((row) => !row.hasDelinquentPayment && row.currentMonthUnpaidAmount > 0);

  return {
    currentMonth,
    activeMembers: activeMembers.length,
    inactiveMembers: store.members.filter((member) => member.inactive).length,
    nonParticipantContacts: nonParticipantContacts.length,
    paidThisMonth,
    paidThisYear,
    pastDue: rows.reduce((sum, row) => sum + row.overdueDue, 0),
    tenDaysLate: rows.reduce((sum, row) => sum + row.tenDaysLateDue, 0),
    delinquentCurrentMonthRisk: delinquentRows.reduce((sum, row) => sum + row.currentMonthUnpaidAmount, 0),
    expectedCurrentMonthFromUpToDate: upToDateExpectedRows.reduce((sum, row) => sum + row.currentMonthUnpaidAmount, 0),
    delinquentMembers: delinquentRows.length,
    upToDateExpectedMembers: upToDateExpectedRows.length,
    rows
  };
}

// Each month's payment is due on the same day of the month as the member's
// signing (contract start) date, clamped for short months (signed the 31st
// means due Feb 28). Once a payment is 10 or more days late it picks up a
// one-time fee of 5% or the minimum stated in that member's contract,
// whichever is greater. Older records default to the historically used $5.
export const LATE_FEE_GRACE_DAYS = 10;
export const LATE_FEE_RATE = 0.05;
export const LATE_FEE_MINIMUM = 5;
export const LATE_FEE_PERCENTAGE = 5;

export function getLateFeeMinimum(member) {
  return normalizeLateFeeMinimum(member?.lateFeeMinimum);
}

export function getLateFeePercentage(member) {
  return normalizeLateFeePercentage(member?.lateFeePercentage);
}

export function getLateFeeBalance(member, payments, today = new Date(), members = []) {
  const account = billingAccount(member, members);
  const paymentState = getMemberPaymentState(member, payments, today, [], members);
  const monthlyAmount = Number(account.billingMember?.monthlyAmount || 0);
  const lateFeeMinimum = getLateFeeMinimum(member);
  const lateFeePercentage = getLateFeePercentage(member);
  const lines = paymentState.months.filter((month) => !month.paid).map((monthState) => {
    const daysLate = monthState.daysLate;
    const lateFee = daysLate >= LATE_FEE_GRACE_DAYS
      ? Math.max(lateFeeMinimum, Math.round(monthlyAmount * (lateFeePercentage / 100) * 100) / 100)
      : 0;
    return {
      month: monthState.month,
      dueDate: monthState.dueDate,
      amount: monthlyAmount,
      daysLate,
      lateFee,
      total: monthlyAmount + lateFee
    };
  });

  const baseDue = lines.reduce((sum, line) => sum + line.amount, 0);
  const feeDue = lines.reduce((sum, line) => sum + line.lateFee, 0);
  return { monthlyAmount, lateFeeMinimum, lateFeePercentage, lines, baseDue, feeDue, totalDue: baseDue + feeDue };
}

export function exportStoreRows(store) {
  const rows = [];
  sortMembersByAccount(store.members).forEach((member) => {
    const accountHolder = getResponsibleParty(member, store.members);
    const memberPayments = store.payments.filter((payment) => payment.memberId === member.id);
    if (memberPayments.length === 0) {
      rows.push(memberRow(member, null, accountHolder));
      return;
    }
    memberPayments.forEach((payment) => rows.push(memberRow(member, payment, accountHolder)));
  });
  return rows;
}

const FULL_BACKUP_SCHEMA = "wmac-full-backup-v1";
const FULL_BACKUP_SCHEMA_COLUMN = "WMAC Backup Schema";
const FULL_BACKUP_MEMBER_COLUMN = "WMAC Member JSON";
const FULL_BACKUP_PAYMENT_COLUMN = "WMAC Payment JSON";

export function isFullBackupCsv(headers = []) {
  return Array.isArray(headers)
    && headers.includes(FULL_BACKUP_SCHEMA_COLUMN)
    && headers.includes(FULL_BACKUP_MEMBER_COLUMN)
    && headers.includes(FULL_BACKUP_PAYMENT_COLUMN);
}

// A full backup intentionally replaces the local member/payment ledger. The
// CSV keeps readable columns alongside exact JSON snapshots so a fresh app can
// restore every saved member field, payer link, collection snapshot, and payment.
export function restoreStoreFromBackupRows(records = []) {
  const members = new Map();
  const payments = new Map();
  (records || []).forEach((record) => {
    if (clean(record?.[FULL_BACKUP_SCHEMA_COLUMN]) !== FULL_BACKUP_SCHEMA) return;
    const member = parseBackupSnapshot(record?.[FULL_BACKUP_MEMBER_COLUMN]);
    if (member?.id && member.name) members.set(member.id, member);
    const payment = parseBackupSnapshot(record?.[FULL_BACKUP_PAYMENT_COLUMN]);
    if (payment?.id && payment.memberId && payment.month) payments.set(payment.id, payment);
  });
  if (members.size === 0) {
    throw new Error("This file does not contain a valid WMAC full backup.");
  }
  const store = migrateStore({
    version: CURRENT_STORE_VERSION,
    members: [...members.values()],
    payments: [...payments.values()],
    updatedAt: new Date().toISOString()
  });
  return { store, memberCount: store.members.length, paymentCount: store.payments.length };
}

// A dated organization snapshot: one row per account, with a status for every
// month in the report year. This complements the detailed payment backup.
export function exportDailyPaymentStatusRows(store, today = new Date()) {
  const reportDate = normalizeDate(today.toISOString().slice(0, 10));
  const year = today.getFullYear();
  const reportMonth = monthKey(today);
  const monthLabels = Array.from({ length: 12 }, (_, index) => ({
    key: `${year}-${String(index + 1).padStart(2, "0")}`,
    label: new Date(year, index, 1).toLocaleDateString("en-US", { month: "short" })
  }));

  return sortMembersByAccount(store?.members || [])
    .map((member) => {
      const responsibleParty = getResponsibleParty(member, store?.members || []);
      const isPayer = (responsibleParty?.id || member.id) === member.id;
      const accountHolder = member.responsiblePartyId
        ? responsibleParty?.name || member.name || ""
        : member.parentName || responsibleParty?.name || member.name || "";
      const paymentState = getMemberPaymentState(member, store?.payments || [], today, [], store?.members || []);
      const statusByMonth = new Map(paymentState.months.map((month) => [month.month, month.state]));
      const balance = getMemberBalance(member, store?.payments || [], today, store?.members || []);
      const row = {
        "Report Date": reportDate,
        "Account Holder / Contract Signer": accountHolder,
        "Account Holder / Payer ID": responsibleParty?.id || member.responsiblePartyId || member.id || "",
        "Member Name": member.name || "",
        "Member ID": member.externalId || member.id || "",
        Household: member.householdName || "",
        "Current Status": dailyAccountStatus(member, paymentState, isPayer),
        "Monthly Amount": moneyText(balance.monthlyAmount),
        "Amount Due Now": moneyText(balance.dueNow)
      };

      monthLabels.forEach(({ key, label }) => {
        row[`${label} ${year}`] = dailyMonthStatus(member, key, reportMonth, statusByMonth, isPayer);
      });
      return row;
    });
}

// The saved ID is the authoritative link. For existing records, a matching
// Parent/Guardian Name remains a useful automatic fallback until the operator
// chooses the signer in the member form.
export function getResponsibleParty(member, members = []) {
  if (!member) return null;
  const linked = (members || []).find((candidate) => candidate.id === member.responsiblePartyId);
  if (linked) return linked;
  const parentName = normalize(member.parentName);
  if (parentName) {
    const sameHousehold = (members || []).find((candidate) =>
      candidate.id !== member.id
      && normalize(candidate.name) === parentName
      && (!member.householdId || candidate.householdId === member.householdId)
    );
    if (sameHousehold) return sameHousehold;
    return (members || []).find((candidate) => candidate.id !== member.id && normalize(candidate.name) === parentName) || member;
  }
  return member;
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
  return sortMembersByAccount(store.members)
    .filter((member) => !member.inactive)
    .map((member) => {
      const accountHolder = getResponsibleParty(member, store.members);
      return {
      "Member Name": member.name,
      "Account Holder / Payer": accountHolder?.name || member.name,
      "Contract Start Date": member.startDate || "",
      "Monthly Amount": moneyText(member.monthlyAmount),
      "Late Fee Minimum": moneyText(getLateFeeMinimum(member)),
      "Late Fee Percentage": String(getLateFeePercentage(member)),
      Email: member.email || "",
      Phone: member.phone || "",
      "Home Phone": member.homePhone || "",
      "Work Phone": member.workPhone || "",
      "Cell Phone": member.cellPhone || member.phone || "",
      Address: member.address || "",
      City: member.city || "",
      State: member.state || "",
      "Zip Code": member.zip || "",
      "Date of Birth": member.dob || "",
      "Agreement Type": member.agreementType || "Contract",
      "Agreement End Date": member.agreementEndDate || defaultAgreementEndDate(member.startDate),
      "Email Consent": member.emailConsent || "No",
      "Text Consent": member.textConsent || "No",
      "Phone Consent": member.phoneConsent || "No",
      "Down Payment": member.downPayment === "" || member.downPayment == null ? "" : moneyText(member.downPayment),
      "Parent/Guardian Name": member.parentName || "",
      "Responsible Party ID": member.responsiblePartyId || "",
      "Member ID": member.externalId || "",
      "Square Customer ID": member.squareCustomerId || "",
      "Household Name": member.householdName || "",
      "Household Role": member.householdRole || "adult",
      Participant: member.participant === false ? "no" : "yes",
      Programs: normalizePrograms(member.programs).join("; "),
      "Current Belt/Level": member.beltLevel || "",
      "Next Belt/Level": member.nextLevel || "",
      "Tae Kwon Do Certification": member.certifications?.tae_kwon_do || "",
      "Muay Thai Certification": member.certifications?.muay_thai || ""
      };
    });
}

export { MEMBER_FIELD_ALIASES, PAYMENT_FIELD_ALIASES };

function memberRow(member, payment, accountHolder = member) {
  return {
    [FULL_BACKUP_SCHEMA_COLUMN]: FULL_BACKUP_SCHEMA,
    [FULL_BACKUP_MEMBER_COLUMN]: JSON.stringify(member),
    [FULL_BACKUP_PAYMENT_COLUMN]: payment ? JSON.stringify(payment) : "",
    "Member Name": member.name,
    "Account Holder / Payer": accountHolder?.name || member.name,
    "Contract Start Date": member.startDate || "",
    "Monthly Amount": moneyText(member.monthlyAmount),
    "Late Fee Minimum": moneyText(getLateFeeMinimum(member)),
    "Late Fee Percentage": String(getLateFeePercentage(member)),
    Email: member.email || "",
    Phone: member.phone || "",
    "Home Phone": member.homePhone || "",
    "Work Phone": member.workPhone || "",
    "Cell Phone": member.cellPhone || member.phone || "",
    Address: member.address || "",
    City: member.city || "",
    State: member.state || "",
    "Zip Code": member.zip || "",
    "Date of Birth": member.dob || "",
    "Agreement Type": member.agreementType || "Contract",
    "Agreement End Date": member.agreementEndDate || defaultAgreementEndDate(member.startDate),
    "Email Consent": member.emailConsent || "No",
    "Text Consent": member.textConsent || "No",
    "Phone Consent": member.phoneConsent || "No",
    "Down Payment": member.downPayment === "" || member.downPayment == null ? "" : moneyText(member.downPayment),
    "Parent/Guardian": member.parentName || "",
    "Responsible Party ID": member.responsiblePartyId || accountHolder?.id || member.id,
    "Member ID": member.externalId || "",
    "Square Customer ID": member.squareCustomerId || "",
    "Household Name": member.householdName || "",
    "Household Role": member.householdRole || "adult",
    Participant: member.participant === false ? "no" : "yes",
    Programs: normalizePrograms(member.programs).join("; "),
    "Current Belt/Level": member.beltLevel || "",
    "Next Belt/Level": member.nextLevel || "",
    "Tae Kwon Do Certification": member.certifications?.tae_kwon_do || "",
    "Muay Thai Certification": member.certifications?.muay_thai || "",
    Inactive: member.inactive ? "yes" : "no",
    "Payment Month": payment?.month || "",
    "Payment Amount": payment ? moneyText(payment.amount) : "",
    "Paid Date": payment?.paidAt || "",
    "Payment Source": payment?.source || "",
    "Payment Category": payment ? payment.category || "tuition" : "",
    "Payment Note": payment?.note || "",
    "Payment Batch ID": payment?.batchId || "",
    "Square Payment ID": payment?.squarePaymentId || "",
    "Provider Payment ID": payment?.providerPaymentId || ""
  };
}

function isTuitionPayment(payment) {
  return !payment?.category || payment.category === "tuition";
}

function parseBackupSnapshot(value) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeLateFeeMinimum(value) {
  const normalized = String(value ?? "").replace(/[$,]/g, "").trim();
  if (!normalized) {
    return LATE_FEE_MINIMUM;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : LATE_FEE_MINIMUM;
}

function normalizeLateFeePercentage(value) {
  const normalized = String(value ?? "").replace(/%/g, "").trim();
  if (!normalized) {
    return LATE_FEE_PERCENTAGE;
  }
  const percentage = Number(normalized);
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
    ? Math.round(percentage * 100) / 100
    : LATE_FEE_PERCENTAGE;
}

export function isActiveParticipant(member) {
  return Boolean(member && !member.inactive && member.participant !== false);
}

export function householdMembers(members, member) {
  if (!member) {
    return [];
  }
  const householdId = member.householdId || householdIdFor(member.householdName);
  if (!householdId) {
    return [member];
  }
  return members
    .filter((candidate) => (candidate.householdId || householdIdFor(candidate.householdName)) === householdId)
    .sort((a, b) => householdRoleOrder(a.householdRole) - householdRoleOrder(b.householdRole) || a.name.localeCompare(b.name));
}

// An account is led by the financially responsible party. This lets a search
// for either a parent or a child show the same account, with the payer first.
export function accountMembers(members, member) {
  if (!member) return [];
  const payerId = getResponsibleParty(member, members)?.id || member.id;
  return sortMembersByAccount((members || []).filter((candidate) =>
    (getResponsibleParty(candidate, members)?.id || candidate.id) === payerId
  ));
}

// A household's payment schedule belongs exclusively to its designated payer.
// That payer may be a non-participating parent; the active participants linked
// to them determine whether the account is billable and what it totals.
function isBillingPayer(member, members = []) {
  if (!member || member.inactive) return false;
  const payer = getResponsibleParty(member, members) || member;
  return payer.id === member.id && accountMembers(members, payer).some(isActiveParticipant);
}

function linkResponsibleParties(members) {
  const knownIds = new Set((members || []).map((member) => member.id));
  return (members || []).map((member) => {
    const savedId = clean(member.responsiblePartyId);
    if (savedId && knownIds.has(savedId)) return member;
    const parentName = normalize(member.parentName);
    const householdId = member.householdId || householdIdFor(member.householdName);
    const candidates = (members || []).filter((candidate) => candidate.id !== member.id);
    const namedParent = parentName && candidates.find((candidate) =>
      normalize(candidate.name) === parentName
      && (!householdId || (candidate.householdId || householdIdFor(candidate.householdName)) === householdId)
    );
    const householdPayer = householdId && candidates.find((candidate) =>
      (candidate.householdId || householdIdFor(candidate.householdName)) === householdId
      && candidate.householdRole === "parent_guardian"
    );
    const payer = namedParent || (member.householdRole === "child" ? householdPayer : null) || member;
    return {
      ...member,
      responsiblePartyId: payer.id,
      parentName: member.parentName || (payer.id !== member.id ? payer.name : "")
    };
  });
}

function sortMembersByAccount(members) {
  return [...(members || [])].sort((left, right) => {
    const leftPayer = getResponsibleParty(left, members)?.name || left.name || "";
    const rightPayer = getResponsibleParty(right, members)?.name || right.name || "";
    return leftPayer.localeCompare(rightPayer)
      || Number(left.responsiblePartyId !== left.id) - Number(right.responsiblePartyId !== right.id)
      || String(left.name || "").localeCompare(String(right.name || ""));
  });
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

function localReviewStatus(input) {
  const status = clean(input?.localStatus || input?.local_status || input?.reviewStatus || input?.review_status || input?.status);
  return ["pending", "needs_match", "approved", "ignored"].includes(status) ? status : "";
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

function billingMonthsForAgreement(member, currentMonth) {
  const firstDueMonth = member.startDate?.slice(0, 7) || currentMonth;
  const months = monthsInRange(firstDueMonth, currentMonth);
  if (normalizeAgreementType(member.agreementType) !== "Contract" || !isIsoDate(member.agreementEndDate)) {
    return months;
  }
  // The signing date begins the first paid month. A fixed-term agreement
  // ends before the installment due on its expiration date, so a one-year
  // agreement has twelve billing months (not thirteen).
  return months.filter((month) => dueDateForMonth(member, month) < member.agreementEndDate);
}

function prepaidContractMonths(member, billableMonths) {
  const monthlyAmount = Number(member.monthlyAmount || 0);
  const downPayment = Number(member.downPayment || 0);
  // A contract down payment only settles the first and final installments
  // when it actually covers both of them. This keeps an arbitrary partial
  // enrollment payment from silently erasing two monthly obligations.
  if (
    normalizeAgreementType(member.agreementType) !== "Contract" ||
    monthlyAmount <= 0 ||
    downPayment + 0.005 < monthlyAmount * 2 ||
    billableMonths.length === 0
  ) {
    return new Set();
  }
  const prepaid = new Set([billableMonths[0]]);
  const firstDueMonth = member.startDate.slice(0, 7);
  const agreementEndDate = normalizeDate(member.agreementEndDate) || defaultAgreementEndDate(member.startDate);
  const finalContractMonth = agreementEndDate
    ? monthsInRange(firstDueMonth, agreementEndDate.slice(0, 7))
      .filter((month) => dueDateForMonth(member, month) < agreementEndDate)
      .at(-1)
    : billableMonths.at(-1);
  // The final prepaid month stays the real final installment even while the
  // contract is in progress. Do not make each newly visible month look paid.
  if (finalContractMonth && billableMonths.includes(finalContractMonth)) prepaid.add(finalContractMonth);
  return prepaid;
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

function shiftMonth(month, offset) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return monthKey(date);
}

function dueDateForMonth(member, month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const dueDay = Number(member.startDate?.split("-")[2]) || 1;
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(Math.min(dueDay, lastDay)).padStart(2, "0")}`;
}

function utcDateValue(value) {
  if (typeof value === "string") {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  }
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function pendingPaymentsFor(member, pendingPayments, members = []) {
  const payer = getResponsibleParty(member, members) || member;
  const accountIds = members.length ? accountMembers(members, payer).map((person) => person.id) : [member.id];
  return (pendingPayments || []).filter((payment) =>
    accountIds.includes(payment.memberId) || accountIds.includes(payment.suggestedMemberId)
  );
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

function parseParticipant(value, existingValue) {
  const cleaned = normalize(value);
  if (!cleaned) {
    return existingValue !== false;
  }
  return !["no", "n", "false", "0", "non participant", "non-participant", "contact only"].includes(cleaned);
}

function normalizeAgreementType(value) {
  const cleaned = normalize(value);
  if (["contract", "fixed", "fixed term", "term"].includes(cleaned)) {
    return "Contract";
  }
  if (["month to month", "monthly", "month-to-month"].includes(cleaned)) {
    return "Month-to-Month";
  }
  return "";
}

function normalizeConsent(value) {
  const cleaned = normalize(value);
  if (["yes", "y", "true", "1", "consented", "authorized"].includes(cleaned)) {
    return "Yes";
  }
  if (["no", "n", "false", "0", "declined", "not authorized"].includes(cleaned)) {
    return "No";
  }
  return "";
}

function normalizeHouseholdRole(value) {
  const cleaned = normalize(value).replace(/[_-]+/g, " ");
  if (["parent", "guardian", "parent guardian", "payer"].includes(cleaned)) {
    return "parent_guardian";
  }
  if (["child", "student child", "minor"].includes(cleaned)) {
    return "child";
  }
  if (["adult", "individual", "self"].includes(cleaned)) {
    return "adult";
  }
  return "";
}

function normalizePrograms(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[;,|/]+/);
  const programs = [];
  values.forEach((entry) => {
    const cleaned = normalize(entry).replace(/[_-]+/g, " ");
    const program = cleaned.includes("muay") || cleaned.includes("thai")
      ? "muay_thai"
      : cleaned.includes("tae") || cleaned.includes("kwon") || cleaned === "tkd"
        ? "tae_kwon_do"
        : "";
    if (program && !programs.includes(program)) {
      programs.push(program);
    }
  });
  return programs;
}

function householdIdFor(name) {
  const normalizedName = normalize(name);
  if (!normalizedName) {
    return "";
  }
  const slug = normalizedName.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let hash = 0;
  for (const char of normalizedName) {
    hash = ((hash << 5) - hash + char.codePointAt(0)) | 0;
  }
  return `house-${slug || "family"}-${Math.abs(hash).toString(36)}`;
}

function householdRoleOrder(role) {
  return role === "parent_guardian" ? 0 : role === "adult" ? 1 : 2;
}

function cryptoId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function dailyAccountStatus(member, paymentState, isPayer = true) {
  if (member.collectionPlacement?.status === "charged_off") return "Placed for collection";
  if (member.inactive) return "Inactive";
  if (!isPayer) return "Covered by payer";
  if (member.participant === false && paymentState.flags.setupNeeded) return "Contact only";
  if (paymentState.flags.setupNeeded) return "Needs setup";
  return paymentState.label;
}

function dailyMonthStatus(member, month, reportMonth, statusByMonth, isPayer = true) {
  if (member.collectionPlacement?.status === "charged_off") return "Collection";
  if (member.inactive) return "Inactive";
  if (!isPayer) return "Covered by payer";
  if (month > reportMonth) return "Future";
  const state = statusByMonth.get(month);
  return {
    paid: "Paid",
    pending: "Awaiting approval",
    attention: "Due",
    behind: "Behind",
    upcoming: "Upcoming"
  }[state] || "Not billed";
}

function moneyText(value) {
  return Number(value || 0).toFixed(2);
}

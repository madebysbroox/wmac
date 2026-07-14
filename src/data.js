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
    version: 2,
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
      members: members.sort((a, b) => a.name.localeCompare(b.name)),
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

export function nextUnpaidTuitionMonth(member, payments, today = new Date()) {
  const unpaidMonths = getUnpaidMonths(member, payments, today);
  return unpaidMonths[0] || monthKey(today);
}

export function pendingStagedPaymentsForMember(providerPayments, member) {
  return (providerPayments || []).filter((payment) =>
    payment.status === "pending" &&
    (payment.memberId === member.id || payment.suggestedMemberId === member.id)
  );
}

export function pendingSquarePaymentsForMember(squarePayments, member) {
  return pendingStagedPaymentsForMember(squarePayments, member);
}

export function normalizeProviderPayment(input, members = [], provider = "square") {
  if (provider === "worldbankcard") {
    return normalizeWorldBankcardPayment(input, members);
  }
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

export function normalizeWorldBankcardPayment(input, members = []) {
  const payment = input?.transaction || input?.payment || input?.sale || input?.item || input || {};
  const id = clean(
    payment.id ||
    payment.transactionId ||
    payment.transaction_id ||
    payment.paymentId ||
    payment.payment_id ||
    payment.worldBankcardPaymentId ||
    payment.worldbankcardPaymentId ||
    payment.world_bankcard_payment_id ||
    payment.worldBankcardTransactionId ||
    payment.worldbankcardTransactionId ||
    payment.world_bankcard_transaction_id ||
    payment.transactionReference ||
    payment.transaction_reference ||
    payment.referenceNumber ||
    payment.reference_number ||
    input?.transactionId ||
    input?.paymentId ||
    input?.worldBankcardPaymentId ||
    input?.worldbankcardPaymentId ||
    input?.id
  );
  const amountCents = amountToCents(
    payment.amountCents ??
    payment.amount_cents ??
    payment.amount?.value ??
    payment.amount?.amount ??
    payment.authorizedAmount ??
    payment.saleAmount ??
    payment.totalAmount ??
    payment.total ??
    payment.amount ??
    input?.amountCents ??
    input?.amount
  );
  const createdSource = payment.transactionDate || payment.transaction_date || payment.createdAt || payment.created_at || payment.date || input?.paidAt || input?.createdAt || input?.receivedAt;
  const paidAt = normalizeDate(createdSource) || new Date().toISOString().slice(0, 10);
  const createdAt = clean(payment.createdAt || payment.created_at || createdSource || input?.createdAt || input?.receivedAt) || new Date().toISOString();
  const buyerName = clean(payment.buyerName || payment.customerName || payment.customer?.name || payment.cardholderName || payment.cardHolderName || input?.buyerName);
  const buyerEmail = clean(payment.buyerEmail || payment.customerEmail || payment.customer?.email || input?.buyerEmail || input?.buyerEmailAddress).toLowerCase();
  const buyerPhone = cleanPhone(payment.buyerPhone || payment.customerPhone || payment.customer?.phone || input?.buyerPhone);
  const notePieces = [
    payment.note || input?.note,
    payment.terminalId || payment.terminal_id ? `Terminal ${payment.terminalId || payment.terminal_id}` : "",
    payment.batchId || payment.batch_id ? `Batch ${payment.batchId || payment.batch_id}` : "",
    payment.cardBrand || payment.card?.brand ? `${payment.cardBrand || payment.card?.brand}${payment.last4 || payment.card?.last4 ? ` ••••${payment.last4 || payment.card?.last4}` : ""}` : ""
  ].filter(Boolean);
  const candidate = {
    provider: "worldbankcard",
    providerLabel: "World Bankcard",
    id: id || cryptoId("wbcpay"),
    worldBankcardPaymentId: id,
    providerPaymentId: id,
    providerEventId: clean(payment.eventId || payment.event_id || input?.eventId),
    sourceEventType: clean(input?.type || input?.sourceEventType || input?.eventType || payment.type),
    status: clean(input?.localStatus || input?.local_status || input?.reviewStatus || input?.review_status) || "pending",
    worldBankcardStatus: clean(input?.worldBankcardStatus || payment.status || payment.transactionStatus || payment.state),
    providerStatus: clean(input?.worldBankcardStatus || payment.status || payment.transactionStatus || payment.state),
    amountCents,
    currency: clean(payment.currency || payment.amount?.currency || payment.currencyCode || input?.currency) || "USD",
    paidAt,
    createdAt,
    updatedAt: clean(payment.updatedAt || payment.updated_at || input?.updatedAt || input?.receivedAt) || createdAt,
    buyerName,
    buyerEmail,
    buyerPhone,
    customerId: clean(payment.customerId || payment.customer_id || payment.customer?.id || input?.customerId),
    externalCustomerId: clean(payment.customerReference || payment.customer_reference || payment.customer?.reference || input?.externalCustomerId),
    receiptUrl: clean(payment.receiptUrl || payment.receipt_url || input?.receiptUrl),
    receiptNumber: clean(payment.receiptNumber || payment.receipt_number || payment.reference || payment.referenceNumber || payment.reference_number || payment.merchantReference || payment.transactionReference || input?.receiptNumber),
    locationId: clean(payment.locationId || payment.location_id || payment.storeId || payment.store_id || input?.locationId),
    terminalId: clean(payment.terminalId || payment.terminal_id || input?.terminalId),
    batchId: clean(payment.batchId || payment.batch_id || input?.batchId),
    orderId: clean(payment.orderId || payment.order_id || payment.merchantOrderId || input?.orderId),
    note: clean(notePieces.join(" · ")),
    reviewNote: clean(input?.reviewNote),
    paymentCategory: clean(input?.paymentCategory),
    paymentMonth: normalizeMonth(input?.paymentMonth) || monthFromDate(createdSource),
    memberId: clean(input?.memberId),
    suggestedMemberId: clean(input?.suggestedMemberId),
    approvedAt: clean(input?.approvedAt),
    approvedBy: clean(input?.approvedBy),
    ignoredAt: clean(input?.ignoredAt),
    ignoredReason: clean(input?.ignoredReason),
    raw: input?.raw || input
  };

  if (!candidate.worldBankcardPaymentId) {
    candidate.worldBankcardPaymentId = candidate.id;
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
    (providerPayment.worldBankcardPaymentId && payment.worldBankcardPaymentId === providerPayment.worldBankcardPaymentId) ||
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
    (!nextPayment.worldBankcardPaymentId || payment.worldBankcardPaymentId !== nextPayment.worldBankcardPaymentId) &&
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
    if (payment.id !== paymentId && payment.squarePaymentId !== paymentId && payment.worldBankcardPaymentId !== paymentId && payment.providerPaymentId !== paymentId) {
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
    return activeMembers.slice(0, 25);
  }
  return activeMembers
    .filter((member) => normalize(member.name).includes(needle))
    .sort((a, b) => normalize(a.name).indexOf(needle) - normalize(b.name).indexOf(needle))
    .slice(0, 25);
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
    worldBankcardPaymentId: clean(payment.worldBankcardPaymentId),
    providerPaymentId: clean(payment.providerPaymentId || payment.squarePaymentId || payment.worldBankcardPaymentId),
    paymentProvider: clean(payment.paymentProvider || payment.source)
  };
  const existingPayments = store.payments.filter((item) => {
    if (nextPayment.squarePaymentId && item.squarePaymentId === nextPayment.squarePaymentId) {
      return false;
    }
    if (nextPayment.worldBankcardPaymentId && item.worldBankcardPaymentId === nextPayment.worldBankcardPaymentId) {
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
  return { ...store, members: members.sort((a, b) => a.name.localeCompare(b.name)), updatedAt: new Date().toISOString() };
}

export function migrateStore(store) {
  if (!store?.members || !store?.payments) {
    return createEmptyStore();
  }
  return {
    ...store,
    version: 2,
    members: store.members.map((member) => {
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
        lateFeeMinimum: getLateFeeMinimum(member),
        lateFeePercentage: getLateFeePercentage(member),
        certifications,
        beltLevel: primaryCertificationLabel({ ...member, certifications }),
        nextLevel: nextMemberCertification({ ...member, certifications }) || member.nextLevel || ""
      };
    })
  };
}

export function getMemberPaymentState(member, payments, today = new Date(), pendingPayments = []) {
  const currentMonth = monthKey(today);
  if (member.participant === false || member.inactive) {
    return {
      level: "paid",
      label: member.inactive ? "Inactive" : "Non-participant",
      currentMonth,
      lastPaidMonth: "",
      recentMonths: [],
      billableMonths: [],
      paidMonths: new Set(),
      unpaidMonths: [],
      dueUnpaidMonths: [],
      upcomingUnpaidMonths: [],
      months: [],
      oldestDaysLate: 0,
      flags: { pending: false, setupNeeded: false }
    };
  }
  const firstDueMonth = getFirstDueMonth(member, currentMonth);
  const billableMonths = monthsInRange(firstDueMonth, currentMonth);
  const paidMonths = new Set(payments.filter((payment) => payment.memberId === member.id && isTuitionPayment(payment)).map((payment) => payment.month));
  const pendingMonths = new Set((pendingPayments || [])
    .filter((payment) => payment.status === "pending" || payment.status === "needs_match")
    .map((payment) => normalizeMonth(payment.paymentMonth || payment.month || payment.paidAt))
    .filter(Boolean));
  const todayUtc = utcDateValue(today);
  const months = billableMonths.map((month) => {
    const dueDate = dueDateForMonth(member, month);
    const daysLate = Math.floor((todayUtc - utcDateValue(dueDate)) / 86400000);
    const paid = paidMonths.has(month);
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
    return { month, dueDate, daysLate, paid, pending, state };
  });
  const recentMonths = billableMonths.slice(-4);
  const lastPaidMonth = Array.from(paidMonths).sort().at(-1) || "";
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
  const setupNeeded = !isIsoDate(member.startDate) || Number(member.monthlyAmount || 0) <= 0;
  if (setupNeeded) {
    level = "watch";
    label = "Needs information";
  }

  return {
    level,
    label,
    currentMonth,
    lastPaidMonth,
    recentMonths: recentMonths.map((month) => ({ month, paid: paidMonths.has(month) })),
    billableMonths,
    paidMonths,
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

export function getMemberStatus(member, payments, today = new Date()) {
  return getMemberPaymentState(member, payments, today);
}

export function getUnpaidMonths(member, payments, today = new Date()) {
  return getMemberPaymentState(member, payments, today).unpaidMonths;
}

export function getMemberBalance(member, payments, today = new Date()) {
  const state = getMemberPaymentState(member, payments, today);
  const unpaidMonths = state.unpaidMonths;
  const monthlyAmount = Number(member.monthlyAmount || 0);
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
    .filter(isActiveParticipant)
    .map((member) => {
      const pending = pendingPaymentsFor(member, pendingPayments);
      const paymentState = getMemberPaymentState(member, store.payments, today, pending);
      const balance = getMemberBalance(member, store.payments, today);
      return { member, paymentState, balance, pending };
    })
    .filter((row) => row.paymentState.dueUnpaidMonths.length > 0 && !row.paymentState.flags.setupNeeded)
    .sort((a, b) => b.paymentState.oldestDaysLate - a.paymentState.oldestDaysLate || b.balance.dueNow - a.balance.dueNow || a.member.name.localeCompare(b.member.name));
}

export function getLandscapeRows(store, pendingPayments = [], today = new Date(), monthCount = 12) {
  const currentMonth = monthKey(today);
  const firstMonth = shiftMonth(currentMonth, -(Math.max(1, monthCount) - 1));
  const visibleMonths = monthsInRange(firstMonth, currentMonth);
  const rows = store.members.filter(isActiveParticipant).map((member) => {
    const pending = pendingPaymentsFor(member, pendingPayments);
    const paymentState = getMemberPaymentState(member, store.payments, today, pending);
    const stateByMonth = new Map(paymentState.months.map((month) => [month.month, month]));
    const cells = visibleMonths.map((month) => ({
      month,
      state: paymentState.flags.setupNeeded ? "not_billable" : stateByMonth.get(month)?.state || "not_billable"
    }));
    return {
      member,
      paymentState,
      balance: getMemberBalance(member, store.payments, today),
      certification: primaryCertificationLabel(member),
      dueDay: isIsoDate(member.startDate) ? Number(member.startDate.split("-")[2]) : null,
      cells
    };
  });
  return { months: visibleMonths, rows };
}

export function reconcileDuePayments(store, member, stillMissingMonths = [], today = new Date()) {
  const keepMissing = new Set(stillMissingMonths.map(normalizeMonth).filter(Boolean));
  const dueMonths = getMemberPaymentState(member, store.payments, today).dueUnpaidMonths.map((month) => month.month);
  const monthsToPay = dueMonths.filter((month) => !keepMissing.has(month));
  const batchId = cryptoId("batch");
  let nextStore = store;
  const paymentIds = [];
  monthsToPay.forEach((month) => {
    nextStore = addPayment(nextStore, {
      memberId: member.id,
      month,
      amount: member.monthlyAmount,
      source: "attention-review",
      batchId
    });
    const payment = nextStore.payments.find((item) => item.memberId === member.id && item.month === month && item.batchId === batchId);
    if (payment) {
      paymentIds.push(payment.id);
    }
  });
  return { store: nextStore, batch: { id: batchId, memberId: member.id, months: monthsToPay, paymentIds } };
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

  const rows = activeMembers.map((member) => {
    const status = getMemberStatus(member, payments, today);
    const balance = getMemberBalance(member, payments, today);
    const lateFeeBalance = getLateFeeBalance(member, payments, today);
    const overdueLines = lateFeeBalance.lines.filter((line) => line.daysLate > 0);
    const tenDaysLateLines = lateFeeBalance.lines.filter((line) => line.daysLate >= LATE_FEE_GRACE_DAYS);
    const olderTenDaysLateLines = tenDaysLateLines.filter((line) => line.month < currentMonth);
    const paidMonths = new Set(payments.filter((payment) => payment.memberId === member.id && isTuitionPayment(payment)).map((payment) => payment.month));
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
      currentMonthUnpaidAmount: currentMonthUnpaid && !currentMonthAlreadyLate ? Number(member.monthlyAmount || 0) : 0,
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

export function getLateFeeBalance(member, payments, today = new Date()) {
  const paymentState = getMemberPaymentState(member, payments, today);
  const monthlyAmount = Number(member.monthlyAmount || 0);
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
    }));
}

export { MEMBER_FIELD_ALIASES, PAYMENT_FIELD_ALIASES };

function memberRow(member, payment) {
  return {
    "Member Name": member.name,
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
    "World Bankcard Payment ID": payment?.worldBankcardPaymentId || "",
    "Provider Payment ID": payment?.providerPaymentId || ""
  };
}

function isTuitionPayment(payment) {
  return !payment?.category || payment.category === "tuition";
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

function amountToCents(value) {
  if (value && typeof value === "object") {
    return amountToCents(value.value ?? value.amount);
  }

  const text = clean(value);
  if (!text) {
    return 0;
  }

  const numeric = Number(text.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  if (/^\s*-?\d+\s*$/.test(text) && Math.abs(numeric) > 999) {
    return Math.round(numeric);
  }
  return Math.round(numeric * 100);
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

function getFirstDueMonth(member, currentMonth) {
  return member.startDate?.slice(0, 7) || currentMonth;
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

function pendingPaymentsFor(member, pendingPayments) {
  return (pendingPayments || []).filter((payment) =>
    payment.memberId === member.id || payment.suggestedMemberId === member.id
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

function moneyText(value) {
  return Number(value || 0).toFixed(2);
}

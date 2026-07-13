const ACTIVITY_LOG_VERSION = 1;
const MAX_ACTIVITY_ENTRIES = 30;
const PAYMENT_ACTIVITY_KINDS = new Set(["payments-added", "payments-removed", "payments-replaced", "provider-status"]);

function cleanId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueIds(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanId).filter(Boolean)));
}

function paymentSnapshots(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  return values.flatMap((payment) => {
    if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
      return [];
    }
    const id = cleanId(payment.id);
    if (!id || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [{ ...payment, id }];
  });
}

function parseRawLog(raw) {
  if (typeof raw !== "string") {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const id = cleanId(raw.id);
  const kind = cleanId(raw.kind);
  if (!id || !PAYMENT_ACTIVITY_KINDS.has(kind)) {
    return null;
  }

  const payments = paymentSnapshots(raw.payments);
  const snapshotIds = payments.map((payment) => payment.id);
  const paymentIds = uniqueIds([...(Array.isArray(raw.paymentIds) ? raw.paymentIds : []), ...snapshotIds]);

  if (kind === "payments-added" && paymentIds.length === 0) {
    return null;
  }
  if (kind === "payments-removed" && payments.length === 0) {
    return null;
  }
  if (kind === "payments-replaced" && (paymentIds.length === 0 || payments.length === 0)) {
    return null;
  }
  const stagedPaymentId = cleanId(raw.stagedPaymentId);
  if (kind === "provider-status" && !stagedPaymentId) {
    return null;
  }

  return {
    id,
    kind,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    undoneAt: typeof raw.undoneAt === "string" && raw.undoneAt ? raw.undoneAt : null,
    memberId: cleanId(raw.memberId),
    memberName: typeof raw.memberName === "string" ? raw.memberName.trim() : "",
    months: uniqueIds(raw.months),
    labelKo: typeof raw.labelKo === "string" ? raw.labelKo.trim() : "",
    labelEn: typeof raw.labelEn === "string" ? raw.labelEn.trim() : "",
    stagedPaymentId,
    provider: cleanId(raw.provider),
    previousStatus: cleanId(raw.previousStatus) || "pending",
    paymentIds,
    payments
  };
}

function activityTimestamp(entry) {
  const timestamp = Date.parse(entry.createdAt);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function makeActivityId() {
  if (globalThis.crypto?.randomUUID) {
    return `activity-${globalThis.crypto.randomUUID()}`;
  }
  return `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Return a safe, serializable activity log. Array-shaped legacy logs and JSON
 * strings are accepted so a damaged persisted value cannot stop the app from
 * loading. Invalid or duplicate entries are ignored instead of guessed.
 */
export function createActivityLog(raw = null) {
  const parsed = parseRawLog(raw);
  const values = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.entries) ? parsed.entries : [];
  const seen = new Set();
  const entries = values
    .map(normalizeEntry)
    .filter((entry) => {
      if (!entry || seen.has(entry.id)) {
        return false;
      }
      seen.add(entry.id);
      return true;
    })
    .sort((left, right) => activityTimestamp(right) - activityTimestamp(left))
    .slice(0, MAX_ACTIVITY_ENTRIES);

  return { version: ACTIVITY_LOG_VERSION, entries };
}

/**
 * Add an activity as the newest log entry. Invalid actions leave the current
 * normalized log untouched.
 */
export function recordActivity(log, action) {
  const current = createActivityLog(log);
  const candidate = normalizeEntry({
    ...action,
    id: cleanId(action?.id) || makeActivityId(),
    createdAt: typeof action?.createdAt === "string" && action.createdAt
      ? action.createdAt
      : new Date().toISOString(),
    undoneAt: null
  });

  if (!candidate) {
    return current;
  }

  return createActivityLog({
    version: ACTIVITY_LOG_VERSION,
    entries: [candidate, ...current.entries.filter((entry) => entry.id !== candidate.id)]
  });
}

/**
 * Undo one exact payment mutation without disturbing other store fields or
 * payments. A repeated undo is a no-op and returns `undone: false`.
 */
export function undoActivity(store, log, activityId) {
  const currentLog = createActivityLog(log);
  const requestedId = cleanId(activityId);
  const activity = currentLog.entries.find((entry) => entry.id === requestedId) || null;

  if (!activity || activity.undoneAt) {
    return { store, log: currentLog, activity, undone: false };
  }

  const activityIndex = currentLog.entries.findIndex((entry) => entry.id === activity.id);
  const relatedIds = new Set(activity.paymentIds);
  const blockedBy = currentLog.entries.slice(0, activityIndex).find((entry) =>
    !entry.undoneAt && entry.paymentIds.some((paymentId) => relatedIds.has(paymentId))
  );
  if (blockedBy) {
    return { store, log: currentLog, activity, undone: false, blockedBy: blockedBy.id };
  }

  const payments = Array.isArray(store?.payments) ? store.payments : [];
  let nextPayments;
  if (activity.kind === "payments-added") {
    const removeIds = new Set(activity.paymentIds);
    nextPayments = payments.filter((payment) => !removeIds.has(cleanId(payment?.id)));
  } else if (activity.kind === "payments-removed") {
    const existingIds = new Set(payments.map((payment) => cleanId(payment?.id)).filter(Boolean));
    const restored = activity.payments.filter((payment) => !existingIds.has(payment.id)).map((payment) => ({ ...payment }));
    nextPayments = [...payments, ...restored];
  } else if (activity.kind === "payments-replaced") {
    const removeIds = new Set(activity.paymentIds.filter((id) => !activity.payments.some((payment) => payment.id === id)));
    const withoutReplacement = payments.filter((payment) => !removeIds.has(cleanId(payment?.id)));
    const existingIds = new Set(withoutReplacement.map((payment) => cleanId(payment?.id)).filter(Boolean));
    const restored = activity.payments.filter((payment) => !existingIds.has(payment.id)).map((payment) => ({ ...payment }));
    nextPayments = [...withoutReplacement, ...restored];
  } else if (activity.kind === "provider-status") {
    nextPayments = payments;
  } else {
    return { store, log: currentLog, activity, undone: false };
  }

  const undoneAt = new Date().toISOString();
  const nextLog = {
    ...currentLog,
    entries: currentLog.entries.map((entry) => entry.id === activity.id ? { ...entry, undoneAt } : entry)
  };
  const nextStore = {
    ...store,
    payments: nextPayments,
    updatedAt: undoneAt
  };

  return {
    store: nextStore,
    log: nextLog,
    activity: nextLog.entries.find((entry) => entry.id === activity.id),
    undone: true
  };
}

export { MAX_ACTIVITY_ENTRIES };

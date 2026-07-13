import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ACTIVITY_ENTRIES,
  createActivityLog,
  recordActivity,
  undoActivity
} from "../src/activity.js";

function payment(id, month = "2026-07", memberId = "member-1") {
  return { id, memberId, month, amount: 120, source: "manual" };
}

function activity(kind, id, createdAt, details = {}) {
  return { id, kind, createdAt, ...details };
}

test("undoes one exact added payment and preserves unrelated store fields", () => {
  const keep = payment("payment-keep", "2026-06");
  const remove = payment("payment-remove");
  const store = { version: 2, members: [{ id: "member-1" }], payments: [keep, remove], custom: "preserved" };
  const log = recordActivity(createActivityLog(), activity("payments-added", "activity-1", "2026-07-12T12:00:00.000Z", {
    paymentIds: [remove.id]
  }));

  const result = undoActivity(store, log, "activity-1");

  assert.equal(result.undone, true);
  assert.deepEqual(result.store.payments, [keep]);
  assert.equal(result.store.custom, "preserved");
  assert.deepEqual(result.store.members, store.members);
  assert.match(result.store.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(result.activity.undoneAt);
});

test("undoes a batch add by exact IDs only", () => {
  const payments = [payment("payment-1"), payment("payment-2", "2026-06"), payment("payment-3", "2026-05")];
  const log = recordActivity(null, activity("payments-added", "activity-batch", "2026-07-12T12:00:00.000Z", {
    paymentIds: ["payment-1", "payment-3"]
  }));

  const result = undoActivity({ payments }, log, "activity-batch");

  assert.deepEqual(result.store.payments.map((item) => item.id), ["payment-2"]);
});

test("restores complete removed payment snapshots without duplicating existing IDs", () => {
  const existing = payment("payment-existing", "2026-06");
  const restored = { ...payment("payment-restored"), note: "cash", paidAt: "2026-07-03", nested: { receipt: "42" } };
  const log = recordActivity(null, activity("payments-removed", "activity-remove", "2026-07-12T12:00:00.000Z", {
    payments: [existing, restored, restored]
  }));

  const result = undoActivity({ payments: [existing], untouched: 7 }, log, "activity-remove");

  assert.equal(result.store.untouched, 7);
  assert.deepEqual(result.store.payments, [existing, restored]);
  assert.equal(result.store.payments.filter((item) => item.id === existing.id).length, 1);
});

test("can target and undo an older activity without changing newer entries", () => {
  let log = createActivityLog();
  log = recordActivity(log, activity("payments-added", "older", "2026-07-10T12:00:00.000Z", { paymentIds: ["payment-old"] }));
  log = recordActivity(log, activity("payments-added", "newer", "2026-07-12T12:00:00.000Z", { paymentIds: ["payment-new"] }));

  const result = undoActivity({ payments: [payment("payment-old"), payment("payment-new")] }, log, "older");

  assert.deepEqual(result.store.payments.map((item) => item.id), ["payment-new"]);
  assert.ok(result.log.entries.find((entry) => entry.id === "older").undoneAt);
  assert.equal(result.log.entries.find((entry) => entry.id === "newer").undoneAt, null);
});

test("repeated undo is idempotent", () => {
  const log = recordActivity(null, activity("payments-removed", "restore-once", "2026-07-12T12:00:00.000Z", {
    payments: [payment("payment-1")]
  }));
  const first = undoActivity({ payments: [] }, log, "restore-once");
  const second = undoActivity(first.store, first.log, "restore-once");

  assert.equal(first.undone, true);
  assert.equal(second.undone, false);
  assert.deepEqual(second.store, first.store);
  assert.equal(second.store.payments.length, 1);
  assert.equal(second.log.entries[0].undoneAt, first.log.entries[0].undoneAt);
});

test("keeps the 30 newest activities in newest-first order", () => {
  let log = createActivityLog();
  for (let index = 0; index < MAX_ACTIVITY_ENTRIES + 5; index += 1) {
    log = recordActivity(log, activity(
      "payments-added",
      `activity-${index}`,
      new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      { paymentIds: [`payment-${index}`] }
    ));
  }

  assert.equal(log.entries.length, MAX_ACTIVITY_ENTRIES);
  assert.equal(log.entries[0].id, "activity-34");
  assert.equal(log.entries.at(-1).id, "activity-5");
});

test("normalizes malformed persisted logs conservatively", () => {
  const validAdded = activity("payments-added", "valid-added", "2026-07-12T12:00:00.000Z", {
    paymentIds: [" payment-1 ", "payment-1", ""]
  });
  const validRemoved = activity("payments-removed", "valid-removed", "2026-07-11T12:00:00.000Z", {
    payments: [payment("payment-2"), null, { amount: 10 }]
  });
  const raw = JSON.stringify({
    version: "bad",
    entries: [
      validAdded,
      validAdded,
      validRemoved,
      null,
      { id: "unknown", kind: "member-edited" },
      { id: "missing-added-ids", kind: "payments-added" },
      { id: "missing-snapshots", kind: "payments-removed", paymentIds: ["payment-3"] }
    ]
  });

  assert.deepEqual(createActivityLog(raw), {
    version: 1,
    entries: [
      {
        id: "valid-added",
        kind: "payments-added",
        createdAt: "2026-07-12T12:00:00.000Z",
        undoneAt: null,
        memberId: "",
        memberName: "",
        months: [],
        labelKo: "",
        labelEn: "",
        stagedPaymentId: "",
        provider: "",
        previousStatus: "pending",
        paymentIds: ["payment-1"],
        payments: []
      },
      {
        id: "valid-removed",
        kind: "payments-removed",
        createdAt: "2026-07-11T12:00:00.000Z",
        undoneAt: null,
        memberId: "",
        memberName: "",
        months: [],
        labelKo: "",
        labelEn: "",
        stagedPaymentId: "",
        provider: "",
        previousStatus: "pending",
        paymentIds: ["payment-2"],
        payments: [payment("payment-2")]
      }
    ]
  });
  assert.deepEqual(createActivityLog("not json"), { version: 1, entries: [] });
  assert.deepEqual(createActivityLog({ entries: "not an array" }), { version: 1, entries: [] });
});

test("invalid new actions leave a normalized log unchanged", () => {
  const log = recordActivity(null, activity("payments-added", "valid", "2026-07-12T12:00:00.000Z", {
    paymentIds: ["payment-1"]
  }));

  assert.deepEqual(recordActivity(log, { kind: "payments-removed", payments: [] }), log);
  assert.deepEqual(undoActivity({ payments: [] }, log, "missing"), {
    store: { payments: [] },
    log,
    activity: null,
    undone: false
  });
});

test("marks a provider status operation undone without changing ledger payments", () => {
  const store = { payments: [payment("keep")], marker: true };
  const log = recordActivity(null, {
    kind: "provider-status",
    stagedPaymentId: "card-1",
    provider: "square",
    previousStatus: "pending"
  });

  const result = undoActivity(store, log, log.entries[0].id);

  assert.equal(result.undone, true);
  assert.deepEqual(result.store.payments, store.payments);
  assert.equal(result.store.marker, true);
  assert.ok(result.activity.undoneAt);
});

test("undoes a replacement by removing the new payment and restoring the old snapshot", () => {
  const oldPayment = payment("old-payment", "2026-07");
  const newPayment = { ...payment("new-payment", "2026-07"), amount: 145 };
  const log = recordActivity(null, {
    kind: "payments-replaced",
    paymentIds: [newPayment.id],
    payments: [oldPayment]
  });

  const result = undoActivity({ payments: [newPayment] }, log, log.entries[0].id);

  assert.equal(result.undone, true);
  assert.deepEqual(result.store.payments, [oldPayment]);
});

test("blocks an older undo until a newer dependent payment action is undone", () => {
  const added = payment("dependent-payment");
  let log = recordActivity(null, {
    id: "older-add",
    kind: "payments-added",
    createdAt: "2026-07-12T12:00:00.000Z",
    paymentIds: [added.id]
  });
  log = recordActivity(log, {
    id: "newer-remove",
    kind: "payments-removed",
    createdAt: "2026-07-13T12:00:00.000Z",
    payments: [added]
  });

  const blocked = undoActivity({ payments: [] }, log, "older-add");
  assert.equal(blocked.undone, false);
  assert.equal(blocked.blockedBy, "newer-remove");

  const restored = undoActivity(blocked.store, blocked.log, "newer-remove");
  const removed = undoActivity(restored.store, restored.log, "older-add");
  assert.equal(removed.undone, true);
  assert.deepEqual(removed.store.payments, []);
});

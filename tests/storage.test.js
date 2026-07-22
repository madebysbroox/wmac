import test from "node:test";
import assert from "node:assert/strict";
import { CURRENT_STORE_VERSION } from "../src/data.js";
import {
  MIGRATION_BACKUP_PREFIX,
  STORE_STORAGE_KEY,
  loadStoreWithMigrationBackup
} from "../src/storage.js";

function memoryStorage(initial = {}, { failWrites = false } = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (failWrites) throw new Error("Storage quota exceeded");
      values.set(key, String(value));
    },
    value(key) {
      return values.get(key);
    }
  };
}

test("creates an exact pre-migration snapshot before upgrading the store version", () => {
  const original = {
    version: 2,
    updatedAt: "2026-07-21T12:00:00.000Z",
    members: [{ id: "member-1", name: "Member", custom: { untouched: true } }],
    payments: [{ id: "payment-1", memberId: "member-1", month: "2026-07", amount: 120 }]
  };
  const storage = memoryStorage({ [STORE_STORAGE_KEY]: JSON.stringify(original) });
  const loaded = loadStoreWithMigrationBackup(storage);
  const backupKey = `${MIGRATION_BACKUP_PREFIX}${CURRENT_STORE_VERSION}`;
  const backup = JSON.parse(storage.value(backupKey));

  assert.equal(loaded.version, CURRENT_STORE_VERSION);
  assert.deepEqual(loaded.members, original.members);
  assert.deepEqual(loaded.payments, original.payments);
  assert.equal(backup.sourceVersion, 2);
  assert.equal(backup.targetVersion, CURRENT_STORE_VERSION);
  assert.deepEqual(backup.store, original);
});

test("does not migrate when the exact safety snapshot cannot be saved", () => {
  const original = {
    version: 2,
    members: [{ id: "member-1", name: "Member" }],
    payments: [{ id: "payment-1", memberId: "member-1", month: "2026-07", amount: 120 }]
  };
  const storage = memoryStorage({ [STORE_STORAGE_KEY]: JSON.stringify(original) }, { failWrites: true });
  const loaded = loadStoreWithMigrationBackup(storage);

  assert.deepEqual(loaded, original);
});

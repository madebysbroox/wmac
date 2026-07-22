import { createEmptyStore, prepareStoreForLoad } from "./data.js";

export const STORE_STORAGE_KEY = "master-lee-payment-tracker";
export const MIGRATION_BACKUP_PREFIX = "master-lee-payment-tracker-pre-migration-v";

export function loadStoreWithMigrationBackup(storage, {
  storageKey = STORE_STORAGE_KEY,
  backupPrefix = MIGRATION_BACKUP_PREFIX
} = {}) {
  try {
    const stored = JSON.parse(storage.getItem(storageKey));
    if (!stored?.members || !stored?.payments) {
      return createEmptyStore();
    }
    const migration = prepareStoreForLoad(stored);
    if (migration.needsBackup && !savePreMigrationBackup(storage, stored, migration, backupPrefix)) {
      return stored;
    }
    return migration.store;
  } catch {
    return createEmptyStore();
  }
}

export function savePreMigrationBackup(storage, store, migration, backupPrefix = MIGRATION_BACKUP_PREFIX) {
  const key = `${backupPrefix}${migration.targetVersion}`;
  if (storage.getItem(key)) {
    return true;
  }
  try {
    storage.setItem(key, JSON.stringify({
      capturedAt: new Date().toISOString(),
      sourceVersion: migration.sourceVersion,
      targetVersion: migration.targetVersion,
      store
    }));
    return true;
  } catch {
    return false;
  }
}

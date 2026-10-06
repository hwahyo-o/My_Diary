export const DATABASE_VERSION = 1;

export const STORE_NAMES = {
  vaultMeta: 'vault_meta',
  records: 'records',
  events: 'events',
  snapshots: 'snapshots',
  securityMeta: 'security_meta',
} as const;

export async function openVaultDatabase(name = 'finance-vault'): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAMES.vaultMeta)) {
        db.createObjectStore(STORE_NAMES.vaultMeta, { keyPath: 'vaultId' });
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.records)) {
        const records = db.createObjectStore(STORE_NAMES.records, { keyPath: 'recordId' });
        records.createIndex('recordType', 'recordType', { unique: false });
        records.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.events)) {
        const events = db.createObjectStore(STORE_NAMES.events, { keyPath: 'eventId' });
        events.createIndex('deviceId', 'deviceId', { unique: false });
        events.createIndex('recordId', 'recordId', { unique: false });
        events.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.snapshots)) {
        db.createObjectStore(STORE_NAMES.snapshots, { keyPath: 'snapshotId' });
      }

      if (!db.objectStoreNames.contains(STORE_NAMES.securityMeta)) {
        db.createObjectStore(STORE_NAMES.securityMeta, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another connection'));
  });
}

export async function deleteVaultDatabase(name = 'finance-vault'): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB deletion blocked by an open connection'));
  });
}

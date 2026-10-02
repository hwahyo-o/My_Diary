import { STORE_NAMES } from './database';

export interface StoredEncryptedRecord {
  readonly recordId: string;
  readonly recordType: string;
  readonly updatedAt: string;
  readonly recordVersion: number;
  readonly encryptedPayload: Uint8Array;
}

export interface StoredEvent {
  readonly eventId: string;
  readonly recordId: string;
  readonly recordType: string;
  readonly action: 'create' | 'update' | 'delete' | 'restore' | 'merge';
  readonly deviceId: string;
  readonly deviceSeq: number;
  readonly createdAt: string;
  readonly encryptedPatch: Uint8Array;
}

export interface StoredSnapshot {
  readonly snapshotId: string;
  readonly vaultId: string;
  readonly createdAt: string;
  readonly reason: 'pre-import' | 'pre-migration' | 'manual';
  readonly schemaVersion: number;
  readonly encryptedPayload: Uint8Array;
}

interface VaultMeta {
  readonly vaultId: string;
  readonly revision: number;
  readonly schemaVersion: number;
}

interface SecurityMetaEntry<T> {
  readonly key: string;
  readonly value: T;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => undefined;
  });
}

export class EncryptedRepository {
  constructor(private readonly db: IDBDatabase) {}

  async commitRecordEvent(
    vaultId: string,
    record: StoredEncryptedRecord,
    event: StoredEvent,
    expectedRevision: number,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(
        [STORE_NAMES.records, STORE_NAMES.events, STORE_NAMES.vaultMeta],
        'readwrite',
      );
      const records = tx.objectStore(STORE_NAMES.records);
      const events = tx.objectStore(STORE_NAMES.events);
      const meta = tx.objectStore(STORE_NAMES.vaultMeta);
      let conflict: Error | undefined;

      const metaRequest = meta.get(vaultId);
      metaRequest.onerror = () => {
        tx.abort();
      };
      metaRequest.onsuccess = () => {
        const current = metaRequest.result as VaultMeta | undefined;
        const currentRevision = current?.revision ?? 0;
        if (currentRevision !== expectedRevision) {
          conflict = new Error(`Revision conflict: expected ${expectedRevision}, found ${currentRevision}`);
          tx.abort();
          return;
        }

        records.put(record);
        events.add(event);
        meta.put({
          vaultId,
          revision: currentRevision + 1,
          schemaVersion: current?.schemaVersion ?? 1,
        } satisfies VaultMeta);
      };

      tx.oncomplete = () => resolve(expectedRevision + 1);
      tx.onerror = () => undefined;
      tx.onabort = () => reject(conflict ?? tx.error ?? new Error('Atomic IndexedDB write failed'));
    });
  }

  async getRecord(recordId: string): Promise<StoredEncryptedRecord | undefined> {
    const tx = this.db.transaction(STORE_NAMES.records, 'readonly');
    return requestValue(tx.objectStore(STORE_NAMES.records).get(recordId));
  }

  async listRecordsByType(recordType: string): Promise<StoredEncryptedRecord[]> {
    const tx = this.db.transaction(STORE_NAMES.records, 'readonly');
    return requestValue<StoredEncryptedRecord[]>(
      tx.objectStore(STORE_NAMES.records).index('recordType').getAll(recordType),
    );
  }

  async listAllRecords(): Promise<StoredEncryptedRecord[]> {
    const tx = this.db.transaction(STORE_NAMES.records, 'readonly');
    return requestValue<StoredEncryptedRecord[]>(tx.objectStore(STORE_NAMES.records).getAll());
  }

  async getEvent(eventId: string): Promise<StoredEvent | undefined> {
    const tx = this.db.transaction(STORE_NAMES.events, 'readonly');
    return requestValue(tx.objectStore(STORE_NAMES.events).get(eventId));
  }

  async listEventsByRecord(recordId: string): Promise<StoredEvent[]> {
    const tx = this.db.transaction(STORE_NAMES.events, 'readonly');
    const events = await requestValue<StoredEvent[]>(
      tx.objectStore(STORE_NAMES.events).index('recordId').getAll(recordId),
    );
    return events.sort((a, b) => a.deviceSeq - b.deviceSeq || a.createdAt.localeCompare(b.createdAt));
  }

  async listAllEvents(): Promise<StoredEvent[]> {
    const tx = this.db.transaction(STORE_NAMES.events, 'readonly');
    return requestValue<StoredEvent[]>(tx.objectStore(STORE_NAMES.events).getAll());
  }

  async getRevision(vaultId: string): Promise<number> {
    const tx = this.db.transaction(STORE_NAMES.vaultMeta, 'readonly');
    const meta = await requestValue<VaultMeta | undefined>(tx.objectStore(STORE_NAMES.vaultMeta).get(vaultId));
    return meta?.revision ?? 0;
  }

  async replaceVaultData(input: {
    readonly vaultId: string;
    readonly schemaVersion: number;
    readonly revision: number;
    readonly records: readonly StoredEncryptedRecord[];
    readonly events: readonly StoredEvent[];
    readonly securityMeta?: { readonly key: string; readonly value: unknown };
  }): Promise<void> {
    const stores: string[] = [STORE_NAMES.records, STORE_NAMES.events, STORE_NAMES.vaultMeta];
    if (input.securityMeta) stores.push(STORE_NAMES.securityMeta);
    const tx = this.db.transaction(stores, 'readwrite');
    const recordsStore = tx.objectStore(STORE_NAMES.records);
    const eventsStore = tx.objectStore(STORE_NAMES.events);
    const metaStore = tx.objectStore(STORE_NAMES.vaultMeta);
    recordsStore.clear();
    eventsStore.clear();
    metaStore.clear();
    for (const record of input.records) recordsStore.put(record);
    for (const event of input.events) eventsStore.put(event);
    metaStore.put({ vaultId: input.vaultId, revision: input.revision, schemaVersion: input.schemaVersion } satisfies VaultMeta);
    if (input.securityMeta) {
      const security = tx.objectStore(STORE_NAMES.securityMeta);
      security.clear();
      security.put({ key: input.securityMeta.key, value: input.securityMeta.value });
    }
    await txDone(tx);
  }

  async putSnapshot(snapshot: StoredSnapshot): Promise<void> {
    const tx = this.db.transaction(STORE_NAMES.snapshots, 'readwrite');
    await requestValue(tx.objectStore(STORE_NAMES.snapshots).put(snapshot));
  }

  async getSnapshot(snapshotId: string): Promise<StoredSnapshot | undefined> {
    const tx = this.db.transaction(STORE_NAMES.snapshots, 'readonly');
    return requestValue(tx.objectStore(STORE_NAMES.snapshots).get(snapshotId));
  }

  async putSecurityMeta<T>(key: string, value: T): Promise<void> {
    const tx = this.db.transaction(STORE_NAMES.securityMeta, 'readwrite');
    await requestValue(tx.objectStore(STORE_NAMES.securityMeta).put({ key, value } satisfies SecurityMetaEntry<T>));
  }

  async getSecurityMeta<T>(key: string): Promise<T | undefined> {
    const tx = this.db.transaction(STORE_NAMES.securityMeta, 'readonly');
    const entry = await requestValue<SecurityMetaEntry<T> | undefined>(tx.objectStore(STORE_NAMES.securityMeta).get(key));
    return entry?.value;
  }
}

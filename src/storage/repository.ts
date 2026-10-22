import { STORE_NAMES } from './database';

export interface StoredEncryptedRecord {
  readonly recordId: string;
  readonly recordType: string;
  readonly updatedAt: string;
  readonly recordVersion: number;
  readonly encryptedPayload: Uint8Array;
}

export interface StoredConflictVariant {
  readonly variantId: string;
  readonly recordId: string;
  readonly recordType: string;
  readonly recordVersion: number;
  readonly updatedAt: string;
  readonly encryptedPayload: Uint8Array;
  readonly source: 'local' | 'cloud';
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
    appendOnly = false,
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

        if (appendOnly) records.add(record);
        else records.put(record);
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

  async commitRecordEventBatch(
    vaultId: string,
    batch: readonly { readonly record: StoredEncryptedRecord; readonly event: StoredEvent }[],
    expectedRevision: number,
  ): Promise<number> {
    if (batch.length < 2 || batch.length > 20) throw new TypeError('Invalid batch size.');
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(
        [STORE_NAMES.records, STORE_NAMES.events, STORE_NAMES.vaultMeta], 'readwrite',
      );
      const records = tx.objectStore(STORE_NAMES.records);
      const events = tx.objectStore(STORE_NAMES.events);
      const meta = tx.objectStore(STORE_NAMES.vaultMeta);
      let conflict: Error | undefined;
      const request = meta.get(vaultId);
      request.onerror = () => tx.abort();
      request.onsuccess = () => {
        const current = request.result as VaultMeta | undefined;
        const revision = current?.revision ?? 0;
        if (revision !== expectedRevision) {
          conflict = new Error(`Revision conflict: expected ${expectedRevision}, found ${revision}`);
          tx.abort();
          return;
        }
        for (const item of batch) {
          records.add(item.record);
          events.add(item.event);
        }
        meta.put({
          vaultId, revision: revision + batch.length, schemaVersion: current?.schemaVersion ?? 1,
        } satisfies VaultMeta);
      };
      tx.oncomplete = () => resolve(expectedRevision + batch.length);
      tx.onerror = () => undefined;
      tx.onabort = () => reject(conflict ?? tx.error ?? new Error('Atomic batch write failed'));
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
    readonly conflictVariants?: readonly StoredConflictVariant[];
    readonly securityMeta?: { readonly key: string; readonly value: unknown };
    readonly expectedRevision?: number;
  }): Promise<void> {
    const stores: string[] = [STORE_NAMES.records, STORE_NAMES.events, STORE_NAMES.vaultMeta, STORE_NAMES.conflictVariants];
    if (input.securityMeta) stores.push(STORE_NAMES.securityMeta);
    const tx = this.db.transaction(stores, 'readwrite');
    const recordsStore = tx.objectStore(STORE_NAMES.records);
    const eventsStore = tx.objectStore(STORE_NAMES.events);
    const metaStore = tx.objectStore(STORE_NAMES.vaultMeta);
    let conflict: Error | undefined;
    const write = () => {
      recordsStore.clear();
      eventsStore.clear();
      tx.objectStore(STORE_NAMES.conflictVariants).clear();
      for (const variant of input.conflictVariants ?? []) tx.objectStore(STORE_NAMES.conflictVariants).add(variant);
      metaStore.clear();
      for (const record of input.records) recordsStore.put(record);
      for (const event of input.events) eventsStore.put(event);
      metaStore.put({ vaultId: input.vaultId, revision: input.revision, schemaVersion: input.schemaVersion } satisfies VaultMeta);
      if (input.securityMeta) {
        const security = tx.objectStore(STORE_NAMES.securityMeta);
        security.clear();
        security.put({ key: input.securityMeta.key, value: input.securityMeta.value });
      }
    };
    const guardedWrite = () => {
      const existingRequest = tx.objectStore(STORE_NAMES.conflictVariants).getAll();
      existingRequest.onerror = () => tx.abort();
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result as StoredConflictVariant[];
        const incoming = new Map((input.conflictVariants ?? []).map(v => [v.variantId, v]));
        const equal = (a: Uint8Array, b: Uint8Array) =>
          a.length === b.length && a.every((value, i) => value === b[i]);
        if (existing.some(v => {
          const matched = incoming.get(v.variantId);
          return !matched || matched.recordId !== v.recordId ||
            matched.recordType !== v.recordType ||
            matched.recordVersion !== v.recordVersion ||
            matched.updatedAt !== v.updatedAt || matched.source !== v.source ||
            !equal(matched.encryptedPayload, v.encryptedPayload);
        })) {
          conflict = new Error('Vault replacement would discard encrypted conflict variants.');
          tx.abort();
          return;
        }
        guardedWrite();
      };
    };
    if (input.expectedRevision === undefined) {
      guardedWrite();
    } else {
      const check = metaStore.get(input.vaultId);
      check.onsuccess = () => {
        const current = (check.result as VaultMeta | undefined)?.revision ?? 0;
        if (current !== input.expectedRevision) {
          conflict = new Error(`Revision conflict: expected ${input.expectedRevision}, found ${current}`);
          tx.abort();
          return;
        }
        write();
      };
      check.onerror = () => tx.abort();
    }
    try {
      await txDone(tx);
    } catch (error) {
      throw conflict ?? error;
    }
  }

  async clearAllData(): Promise<void> {
    const tx = this.db.transaction(
      [STORE_NAMES.records, STORE_NAMES.events, STORE_NAMES.vaultMeta, STORE_NAMES.snapshots, STORE_NAMES.securityMeta, STORE_NAMES.conflictVariants],
      'readwrite',
    );
    for (const storeName of [
      STORE_NAMES.records,
      STORE_NAMES.events,
      STORE_NAMES.vaultMeta,
      STORE_NAMES.snapshots,
      STORE_NAMES.securityMeta,
      STORE_NAMES.conflictVariants,
    ]) {
      tx.objectStore(storeName).clear();
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

  /** Atomically install acknowledged cloud metadata only if Vault data has not changed. */
  async putSecurityMetaIfVaultRevision<T>(
    vaultId: string, expectedRevision: number, key: string, value: T,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAMES.vaultMeta, STORE_NAMES.securityMeta], 'readwrite');
      let conflict: Error | undefined;
      const metaRequest = tx.objectStore(STORE_NAMES.vaultMeta).get(vaultId);
      metaRequest.onerror = () => tx.abort();
      metaRequest.onsuccess = () => {
        const current = metaRequest.result as VaultMeta | undefined;
        if ((current?.revision ?? 0) !== expectedRevision) {
          conflict = new Error('Vault revision changed during cloud metadata recovery.');
          tx.abort();
          return;
        }
        tx.objectStore(STORE_NAMES.securityMeta).put({ key, value } satisfies SecurityMetaEntry<T>);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => undefined;
      tx.onabort = () => reject(conflict ?? tx.error ?? new Error('Cloud metadata recovery transaction failed.'));
    });
  }

  /** Preserve a divergent encrypted record without changing the primary record identity. */
  async appendConflictVariant(variant: StoredConflictVariant): Promise<void> {
    if (!variant.variantId || !variant.recordId || !variant.encryptedPayload.length ||
        (variant.source !== 'local' && variant.source !== 'cloud')) {
      throw new Error('Invalid encrypted conflict variant.');
    }
    const tx = this.db.transaction(STORE_NAMES.conflictVariants, 'readwrite');
    await requestValue(tx.objectStore(STORE_NAMES.conflictVariants).add(variant));
  }

  async listAllConflictVariants(): Promise<StoredConflictVariant[]> {
    const tx = this.db.transaction(STORE_NAMES.conflictVariants, 'readonly');
    return requestValue<StoredConflictVariant[]>(tx.objectStore(STORE_NAMES.conflictVariants).getAll());
  }

  async listConflictVariants(recordId: string): Promise<StoredConflictVariant[]> {
    const tx = this.db.transaction(STORE_NAMES.conflictVariants, 'readonly');
    return requestValue<StoredConflictVariant[]>(
      tx.objectStore(STORE_NAMES.conflictVariants).index('recordId').getAll(recordId),
    );
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

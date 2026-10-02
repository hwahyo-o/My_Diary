import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openVaultDatabase, STORE_NAMES } from './database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from './repository';
import { assertSupportedSchemaVersion } from './schema';

let dbCounter = 0;
function nextDbName(): string {
  dbCounter += 1;
  return `finance-vault-test-${dbCounter}`;
}

function record(id = 'record-1'): StoredEncryptedRecord {
  return {
    recordId: id,
    recordType: 'transaction',
    updatedAt: '2026-10-02T04:00:00.000Z',
    recordVersion: 1,
    encryptedPayload: new Uint8Array([10, 20, 30]),
  };
}

function event(id = 'event-1'): StoredEvent {
  return {
    eventId: id,
    recordId: 'record-1',
    recordType: 'transaction',
    action: 'create',
    deviceId: 'device-1',
    deviceSeq: 1,
    createdAt: '2026-10-02T04:00:00.000Z',
    encryptedPatch: new Uint8Array([40, 50]),
  };
}

function expectRecord(actual: StoredEncryptedRecord | undefined, expected: StoredEncryptedRecord): void {
  expect(actual).toBeDefined();
  expect(actual?.recordId).toBe(expected.recordId);
  expect(actual?.recordType).toBe(expected.recordType);
  expect(actual?.updatedAt).toBe(expected.updatedAt);
  expect(actual?.recordVersion).toBe(expected.recordVersion);
  expect([...(actual?.encryptedPayload ?? [])]).toEqual([...expected.encryptedPayload]);
}

function expectEvent(actual: StoredEvent | undefined, expected: StoredEvent): void {
  expect(actual).toBeDefined();
  expect(actual?.eventId).toBe(expected.eventId);
  expect(actual?.recordId).toBe(expected.recordId);
  expect(actual?.deviceSeq).toBe(expected.deviceSeq);
  expect([...(actual?.encryptedPatch ?? [])]).toEqual([...expected.encryptedPatch]);
}

describe('IndexedDB schema', () => {
  it('creates only the encrypted persistence stores and required indexes', async () => {
    const db = await openVaultDatabase(nextDbName());
    try {
      expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(Object.values(STORE_NAMES)));

      const tx = db.transaction([STORE_NAMES.records, STORE_NAMES.events], 'readonly');
      const records = tx.objectStore(STORE_NAMES.records);
      const events = tx.objectStore(STORE_NAMES.events);
      expect([...records.indexNames]).toEqual(expect.arrayContaining(['recordType', 'updatedAt']));
      expect([...events.indexNames]).toEqual(expect.arrayContaining(['deviceId', 'recordId', 'createdAt']));
    } finally {
      db.close();
    }
  });
});

describe('EncryptedRepository atomic writes', () => {
  it('commits encrypted record, event, and revision together', async () => {
    const db = await openVaultDatabase(nextDbName());
    try {
      const repo = new EncryptedRepository(db);
      await repo.commitRecordEvent('vault-1', record(), event(), 0);

      expectRecord(await repo.getRecord('record-1'), record());
      expectEvent(await repo.getEvent('event-1'), event());
      expect(await repo.getRevision('vault-1')).toBe(1);
    } finally {
      db.close();
    }
  });

  it('aborts record and revision changes when the event write fails', async () => {
    const db = await openVaultDatabase(nextDbName());
    try {
      const repo = new EncryptedRepository(db);
      await repo.commitRecordEvent('vault-1', record(), event(), 0);

      const updated = { ...record(), recordVersion: 2, encryptedPayload: new Uint8Array([99]) };
      await expect(repo.commitRecordEvent('vault-1', updated, event(), 1)).rejects.toThrow();

      expectRecord(await repo.getRecord('record-1'), record());
      expect(await repo.getRevision('vault-1')).toBe(1);
    } finally {
      db.close();
    }
  });

  it('rejects stale expected revisions instead of silently overwriting', async () => {
    const db = await openVaultDatabase(nextDbName());
    try {
      const repo = new EncryptedRepository(db);
      await repo.commitRecordEvent('vault-1', record(), event(), 0);

      await expect(repo.commitRecordEvent('vault-1', { ...record('record-2') }, { ...event('event-2'), recordId: 'record-2' }, 0)).rejects.toThrow(/revision/i);
      expect(await repo.getRecord('record-2')).toBeUndefined();
    } finally {
      db.close();
    }
  });
});

describe('snapshots and schema guard', () => {
  it('stores encrypted snapshot bytes without requiring plaintext state', async () => {
    const db = await openVaultDatabase(nextDbName());
    try {
      const repo = new EncryptedRepository(db);
      const snapshot = {
        snapshotId: 'snapshot-1',
        vaultId: 'vault-1',
        createdAt: '2026-10-02T04:00:00.000Z',
        reason: 'pre-migration' as const,
        schemaVersion: 1,
        encryptedPayload: new Uint8Array([7, 8, 9]),
      };

      await repo.putSnapshot(snapshot);
      const restored = await repo.getSnapshot('snapshot-1');
      expect(restored?.snapshotId).toBe(snapshot.snapshotId);
      expect(restored?.reason).toBe(snapshot.reason);
      expect([...(restored?.encryptedPayload ?? [])]).toEqual([7, 8, 9]);
    } finally {
      db.close();
    }
  });

  it('fails closed on future schema versions', () => {
    expect(() => assertSupportedSchemaVersion(2, 1)).toThrow(/newer/i);
    expect(() => assertSupportedSchemaVersion(1, 1)).not.toThrow();
  });
});

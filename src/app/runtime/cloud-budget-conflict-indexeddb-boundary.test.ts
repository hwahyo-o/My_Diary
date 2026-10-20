import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from '../../storage/repository';
import { reconcileEncryptedCollections } from './browser-runtime';
import { assertNoCloudHardConflicts } from './cloud-hard-conflict-gate';

it('preserves actual IndexedDB ledger and revision when encrypted remote budget conflicts', async () => {
  const db = await openVaultDatabase(`real-conflict-boundary-${crypto.randomUUID()}`);
  const repository = new EncryptedRepository(db);
  const vaultId = crypto.randomUUID();
  const local: StoredEncryptedRecord = {
    recordId: 'shared-budget', recordType: 'budget', recordVersion: 1,
    updatedAt: '2026-10-20T02:00:00.000Z', encryptedPayload: new Uint8Array([1, 2]),
  };
  const event: StoredEvent = {
    eventId: 'local-event', recordId: local.recordId, recordType: 'budget',
    action: 'create', deviceId: 'local-device', deviceSeq: 1,
    createdAt: local.updatedAt, encryptedPatch: new Uint8Array([3]),
  };
  try {
    await repository.commitRecordEvent(vaultId, local, event, await repository.getRevision(vaultId));
    const revisionBefore = await repository.getRevision(vaultId);
    const recordsBefore = await repository.listAllRecords();
    const eventsBefore = await repository.listAllEvents();
    const remote = { ...local, encryptedPayload: new Uint8Array([9, 8]) };
    const merged = reconcileEncryptedCollections(recordsBefore, [remote], eventsBefore, []);
    expect(merged.hardConflicts).toBeGreaterThan(0);
    await expect((async () => {
      assertNoCloudHardConflicts(merged.hardConflicts);
      await repository.replaceVaultData({
        vaultId, schemaVersion: 1, revision: revisionBefore + 1,
        records: merged.records, events: merged.events,
      });
    })()).rejects.toThrow('manual resolution');
    expect(await repository.getRevision(vaultId)).toBe(revisionBefore);
    expect(await repository.listAllRecords()).toEqual(recordsBefore);
    expect(await repository.listAllEvents()).toEqual(eventsBefore);
  } finally {
    db.close();
  }
});

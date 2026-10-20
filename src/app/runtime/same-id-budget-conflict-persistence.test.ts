import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from '../../storage/repository';
import { reconcileEncryptedCollections } from './browser-runtime';
import { assertNoCloudHardConflicts } from './cloud-hard-conflict-gate';

it('does not overwrite a locally modified budget when another device changes the same record identity', async () => {
  const db = await openVaultDatabase(`same-id-budget-conflict-${crypto.randomUUID()}`);
  const repository = new EncryptedRepository(db);
  const vaultId = crypto.randomUUID();
  const local: StoredEncryptedRecord = {
    recordId: 'same-budget-id', recordType: 'budget', recordVersion: 2,
    updatedAt: '2026-10-20T04:00:00.000Z', encryptedPayload: new Uint8Array([1, 2, 3]),
  };
  const event: StoredEvent = {
    eventId: 'local-event', recordId: local.recordId, recordType: 'budget',
    action: 'update', deviceId: 'local-device', deviceSeq: 2,
    createdAt: local.updatedAt, encryptedPatch: new Uint8Array([4]),
  };
  try {
    await repository.commitRecordEvent(vaultId, local, event, await repository.getRevision(vaultId));
    const beforeRevision = await repository.getRevision(vaultId);
    const remote = { ...local, encryptedPayload: new Uint8Array([7, 8, 9]) };
    const reconciled = reconcileEncryptedCollections(
      await repository.listAllRecords(), [remote], await repository.listAllEvents(), [],
    );
    expect(reconciled.hardConflicts).toBeGreaterThan(0);
    await expect((async () => {
      assertNoCloudHardConflicts(reconciled.hardConflicts);
      await repository.replaceVaultData({
        vaultId, schemaVersion: 1, revision: beforeRevision + 1,
        expectedRevision: beforeRevision, records: reconciled.records, events: reconciled.events,
      });
    })()).rejects.toThrow('manual resolution');
    expect(await repository.getRevision(vaultId)).toBe(beforeRevision);
    const persisted = await repository.listAllRecords();
    expect(persisted).toHaveLength(1);
    expect(Array.from(persisted[0]!.encryptedPayload)).toEqual([1, 2, 3]);
    expect((await repository.listAllEvents()).map((entry) => entry.eventId)).toEqual(['local-event']);
  } finally {
    db.close();
  }
});

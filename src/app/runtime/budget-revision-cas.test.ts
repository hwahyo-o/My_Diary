import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from '../../storage/repository';

it('atomically rejects a stale competing budget write without losing the winner or adding an orphan event', async () => {
  const dbName = `budget-cas-${crypto.randomUUID()}`;
  const dbA = await openVaultDatabase(dbName);
  const dbB = await openVaultDatabase(dbName);
  const repoA = new EncryptedRepository(dbA);
  const repoB = new EncryptedRepository(dbB);
  const vaultId = crypto.randomUUID();
  const makeRecord = (id: string): StoredEncryptedRecord => ({
    recordId: id,
    recordType: 'budget',
    recordVersion: 1,
    updatedAt: '2026-10-19T07:00:00.000Z',
    encryptedPayload: new Uint8Array([1, 2, 3]),
  });
  const makeEvent = (id: string, recordId: string): StoredEvent => ({
    eventId: id,
    recordId,
    recordType: 'budget',
    action: 'create',
    deviceId: 'device-a',
    deviceSeq: 1,
    createdAt: '2026-10-19T07:00:00.000Z',
    encryptedPatch: new Uint8Array([4, 5]),
  });
  try {
    const revisionA = await repoA.getRevision(vaultId);
    const revisionB = await repoB.getRevision(vaultId);
    expect(revisionA).toBe(revisionB);
    await repoA.commitRecordEvent(vaultId, makeRecord('budget-winner'), makeEvent('event-winner', 'budget-winner'), revisionA);
    await expect(repoB.commitRecordEvent(vaultId, makeRecord('budget-stale'), makeEvent('event-stale', 'budget-stale'), revisionB))
      .rejects.toThrow('Revision conflict');
    expect((await repoA.listRecordsByType('budget')).map((item) => item.recordId)).toEqual(['budget-winner']);
    expect((await repoB.listAllEvents()).map((item) => item.eventId)).toEqual(['event-winner']);
    expect(await repoA.getRevision(vaultId)).toBe(revisionA + 1);
    const latestRevision = await repoB.getRevision(vaultId);
    await repoB.commitRecordEvent(vaultId, makeRecord('budget-retried'), makeEvent('event-retried', 'budget-retried'), latestRevision);
    expect((await repoA.listRecordsByType('budget')).map((item) => item.recordId).sort())
      .toEqual(['budget-retried', 'budget-winner']);
    expect((await repoB.listAllEvents()).map((item) => item.eventId).sort())
      .toEqual(['event-retried', 'event-winner']);
  } finally {
    dbA.close();
    dbB.close();
  }
});

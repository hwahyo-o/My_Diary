import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from '../../storage/repository';

it('allows an atomic replacement at current revision after a stale attempt is rejected', async () => {
  const dbName = `cloud-replacement-cas-retry-${crypto.randomUUID()}`;
  const dbA = await openVaultDatabase(dbName);
  const dbB = await openVaultDatabase(dbName);
  const a = new EncryptedRepository(dbA);
  const b = new EncryptedRepository(dbB);
  const vaultId = crypto.randomUUID();
  const record: StoredEncryptedRecord = {
    recordId: 'budget-original', recordType: 'budget', recordVersion: 1,
    updatedAt: '2026-10-20T03:00:00.000Z', encryptedPayload: new Uint8Array([1]),
  };
  const event: StoredEvent = {
    eventId: 'original-event', recordId: record.recordId, recordType: 'budget',
    action: 'create', deviceId: 'device-a', deviceSeq: 1,
    createdAt: record.updatedAt, encryptedPatch: new Uint8Array([2]),
  };
  try {
    const staleRevision = await b.getRevision(vaultId);
    await a.commitRecordEvent(vaultId, record, event, staleRevision);
    const currentRevision = await a.getRevision(vaultId);
    const replacement = { ...record, recordId: 'budget-replaced', encryptedPayload: new Uint8Array([3]) };
    const params = { vaultId, schemaVersion: 1, revision: currentRevision + 1, records: [replacement], events: [] };
    await expect(b.replaceVaultData({ ...params, expectedRevision: staleRevision }))
      .rejects.toThrow('Revision conflict');
    expect((await a.listAllRecords()).map((item) => item.recordId)).toEqual([record.recordId]);
    expect(Array.from((await a.listAllRecords())[0]!.encryptedPayload)).toEqual([1]);
    expect((await a.listAllEvents()).map((item) => item.eventId)).toEqual([event.eventId]);
    await b.replaceVaultData({ ...params, expectedRevision: currentRevision });
    expect(await a.getRevision(vaultId)).toBe(currentRevision + 1);
    expect((await a.listAllRecords()).map((item) => item.recordId)).toEqual([replacement.recordId]);
    expect(Array.from((await a.listAllRecords())[0]!.encryptedPayload)).toEqual([3]);
    expect(await a.listAllEvents()).toEqual([]);
  } finally {
    dbA.close();
    dbB.close();
  }
});

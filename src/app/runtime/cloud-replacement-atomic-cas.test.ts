import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from '../../storage/repository';

it('atomically rejects a stale cloud replacement without clearing records or events', async () => {
  const name = `cloud-atomic-cas-${crypto.randomUUID()}`;
  const dbA = await openVaultDatabase(name);
  const dbB = await openVaultDatabase(name);
  const first = new EncryptedRepository(dbA);
  const second = new EncryptedRepository(dbB);
  const vaultId = crypto.randomUUID();
  const record: StoredEncryptedRecord = {
    recordId: 'local-budget', recordType: 'budget', recordVersion: 1,
    updatedAt: '2026-10-20T02:00:00.000Z', encryptedPayload: new Uint8Array([1]),
  };
  const event: StoredEvent = {
    eventId: 'local-event', recordId: record.recordId, recordType: 'budget',
    action: 'create', deviceId: 'device-a', deviceSeq: 1,
    createdAt: record.updatedAt, encryptedPatch: new Uint8Array([2]),
  };
  try {
    const oldRevision = await first.getRevision(vaultId);
    await first.commitRecordEvent(vaultId, record, event, oldRevision);
    const winnerRevision = await first.getRevision(vaultId);
    const beforeRecords = await first.listAllRecords();
    const beforeEvents = await first.listAllEvents();
    await expect(second.replaceVaultData({
      vaultId, schemaVersion: 1, revision: winnerRevision + 1,
      expectedRevision: oldRevision, records: [], events: [],
    })).rejects.toThrow('Revision conflict');
    expect(await first.getRevision(vaultId)).toBe(winnerRevision);
    expect(await first.listAllRecords()).toEqual(beforeRecords);
    expect(await first.listAllEvents()).toEqual(beforeEvents);
  } finally {
    dbA.close();
    dbB.close();
  }
});

import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from '../../storage/repository';
import { reconcileEncryptedCollections } from './browser-runtime';
import { assertNoCloudHardConflicts } from './cloud-hard-conflict-gate';

it('retains both device ledgers when the same encrypted budget identity diverges', async () => {
  const dbA = await openVaultDatabase(`same-id-a-${crypto.randomUUID()}`);
  const dbB = await openVaultDatabase(`same-id-b-${crypto.randomUUID()}`);
  const a = new EncryptedRepository(dbA);
  const b = new EncryptedRepository(dbB);
  const vaultId = crypto.randomUUID();
  const base: StoredEncryptedRecord = {
    recordId: 'shared-budget', recordType: 'budget', recordVersion: 2,
    updatedAt: '2026-10-20T05:00:00.000Z', encryptedPayload: new Uint8Array([1]),
  };
  const remote: StoredEncryptedRecord = { ...base, encryptedPayload: new Uint8Array([2]) };
  const makeEvent = (id: string, deviceId: string): StoredEvent => ({
    eventId: id, recordId: base.recordId, recordType: 'budget', action: 'update',
    deviceId, deviceSeq: 2, createdAt: base.updatedAt, encryptedPatch: new Uint8Array([3]),
  });
  try {
    await a.commitRecordEvent(vaultId, base, makeEvent('a-event', 'a'), await a.getRevision(vaultId));
    await b.commitRecordEvent(vaultId, remote, makeEvent('b-event', 'b'), await b.getRevision(vaultId));
    const revisionA = await a.getRevision(vaultId);
    const revisionB = await b.getRevision(vaultId);
    const merged = reconcileEncryptedCollections(
      await a.listAllRecords(), await b.listAllRecords(),
      await a.listAllEvents(), await b.listAllEvents(),
    );
    expect(merged.hardConflicts).toBeGreaterThan(0);
    expect(() => assertNoCloudHardConflicts(merged.hardConflicts)).toThrow('manual resolution');
    expect(await a.getRevision(vaultId)).toBe(revisionA);
    expect(await b.getRevision(vaultId)).toBe(revisionB);
    expect(Array.from((await a.listAllRecords())[0]!.encryptedPayload)).toEqual([1]);
    expect(Array.from((await b.listAllRecords())[0]!.encryptedPayload)).toEqual([2]);
    expect((await a.listAllEvents()).map((e) => e.eventId)).toEqual(['a-event']);
    expect((await b.listAllEvents()).map((e) => e.eventId)).toEqual(['b-event']);
  } finally {
    dbA.close();
    dbB.close();
  }
});

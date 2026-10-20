import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from '../../storage/repository';
import { preflightBudgetConflictConfirmation } from './budget-conflict-confirmation-preflight';

it('rejects a stale preflight write atomically and preserves the winning local event', async () => {
  const name = `preflight-cas-${crypto.randomUUID()}`;
  const aDb = await openVaultDatabase(name);
  const bDb = await openVaultDatabase(name);
  const a = new EncryptedRepository(aDb);
  const b = new EncryptedRepository(bDb);
  const vaultId = crypto.randomUUID();
  const context = {
    expectedAccountId: 'account', remoteAccountId: 'account',
    expectedVaultId: vaultId, remoteVaultId: vaultId,
    expectedCloudRevision: 5, downloadedCloudRevision: 5, latestCloudRevision: 5,
    localRevisionAtRead: 0, localRevisionBeforeDisplay: 0, unlocked: true,
  };
  const comparison = {
    candidates: [{ recordId: 'budget-id', month: '2026-10-01', localLimitMinor: 100000, remoteLimitMinor: 200000 }],
    unresolvedNonBudgetRecordCount: 0, unresolvedEventCount: 0,
  };
  const selection = {
    recordId: 'budget-id', month: '2026-10-01', choice: 'local' as const,
    expectedLocalLimitMinor: 100000, expectedCloudLimitMinor: 200000,
  };
  const makeRecord = (id: string): StoredEncryptedRecord => ({
    recordId: id, recordType: 'budget', recordVersion: 1,
    updatedAt: '2026-10-20T08:00:00.000Z', encryptedPayload: new Uint8Array([1]),
  });
  const makeEvent = (id: string, recordId: string): StoredEvent => ({
    eventId: id, recordId, recordType: 'budget', action: 'create',
    deviceId: 'device-a', deviceSeq: 1, createdAt: '2026-10-20T08:00:00.000Z',
    encryptedPatch: new Uint8Array([2]),
  });
  try {
    expect(preflightBudgetConflictConfirmation(context, comparison, selection).selectedLimitMinor).toBe(100000);
    await a.commitRecordEvent(vaultId, makeRecord('winner'), makeEvent('winner-event', 'winner'), 0);
    await expect(b.commitRecordEvent(vaultId,
      makeRecord('stale-writer'), makeEvent('stale-event', 'stale-writer'), 0,
    )).rejects.toThrow('Revision conflict');
    expect(await a.getRevision(vaultId)).toBe(1);
    expect((await a.listAllRecords()).map((r) => r.recordId)).toEqual(['winner']);
    expect((await a.listAllEvents()).map((e) => e.eventId)).toEqual(['winner-event']);
  } finally {
    aDb.close();
    bDb.close();
  }
});

import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from '../../storage/repository';
import { commitEncryptedBudgetResolutionAppend } from './atomic-budget-resolution-append';
import type { ImmutableBudgetResolutionPlan } from './budget-conflict-immutable-resolution-plan';

const plan: ImmutableBudgetResolutionPlan = {
  sourceRecordId: 'original', month: '2026-10-01', chosenLimitMinor: 120000,
  expectedLocalRevision: 0, expectedCloudRevision: 3, mode: 'append-new-budget',
};
const record: StoredEncryptedRecord = {
  recordId: 'new-budget', recordType: 'budget', recordVersion: 1,
  updatedAt: '2026-10-21T02:00:00.000Z', encryptedPayload: new Uint8Array([1]),
};
const event: StoredEvent = {
  eventId: 'new-budget-event', recordId: 'new-budget', recordType: 'budget',
  action: 'create', deviceId: 'device-a', deviceSeq: 1,
  createdAt: record.updatedAt, encryptedPatch: new Uint8Array([2]),
};
it('atomically appends the encrypted resolution without replacing existing records', async () => {
  const db = await openVaultDatabase(`append-resolution-${crypto.randomUUID()}`);
  const repo = new EncryptedRepository(db);
  const vaultId = crypto.randomUUID();
  try {
    expect(await commitEncryptedBudgetResolutionAppend(repo, vaultId, plan, record, event, 3)).toBe(1);
    expect((await repo.listAllRecords()).map((item) => item.recordId)).toEqual(['new-budget']);
    expect((await repo.listAllEvents()).map((item) => item.eventId)).toEqual(['new-budget-event']);
    expect(await repo.getRevision(vaultId)).toBe(1);
    await expect(commitEncryptedBudgetResolutionAppend(repo, vaultId, plan, record, event, 3))
      .rejects.toThrow();
    expect(await repo.getRevision(vaultId)).toBe(1);
  } finally { db.close(); }
});
it('rejects an outdated cloud revision without writing to IndexedDB', async () => {
  const db = await openVaultDatabase(`append-resolution-stale-${crypto.randomUUID()}`);
  const repo = new EncryptedRepository(db);
  const vaultId = crypto.randomUUID();
  try {
    await expect(commitEncryptedBudgetResolutionAppend(repo, vaultId, plan, record, event, 4))
      .rejects.toThrow('revisions');
    expect(await repo.listAllRecords()).toHaveLength(0);
    expect(await repo.getRevision(vaultId)).toBe(0);
  } finally { db.close(); }
});

it('prevents overwriting an existing record identity inside the IndexedDB transaction', async () => {
  const db = await openVaultDatabase(`append-duplicate-${crypto.randomUUID()}`);
  const repo = new EncryptedRepository(db);
  const vaultId = crypto.randomUUID();
  const oldRecord = { ...record, encryptedPayload: new Uint8Array([7]) };
  const oldEvent = { ...event, eventId: 'old-event' };
  try {
    await repo.commitRecordEvent(vaultId, oldRecord, oldEvent, 0);
    const currentPlan = { ...plan, expectedLocalRevision: 1 };
    await expect(commitEncryptedBudgetResolutionAppend(repo, vaultId,
      currentPlan, record, event, 3)).rejects.toThrow();
    expect(Array.from((await repo.listAllRecords())[0]!.encryptedPayload)).toEqual([7]);
    expect((await repo.listAllEvents()).map((e) => e.eventId)).toEqual(['old-event']);
    expect(await repo.getRevision(vaultId)).toBe(1);
  } finally { db.close(); }
});

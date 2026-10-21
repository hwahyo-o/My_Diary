import { expect, it } from 'vitest';
import { assertAppendOnlyBudgetResolution } from './budget-resolution-append-guard';
import type { ImmutableBudgetResolutionPlan } from './budget-conflict-immutable-resolution-plan';
import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';
const plan: ImmutableBudgetResolutionPlan = {
  sourceRecordId: 'source', month: '2026-10-01', chosenLimitMinor: 120000,
  expectedLocalRevision: 4, expectedCloudRevision: 6, mode: 'append-new-budget',
};
const record: StoredEncryptedRecord = {
  recordId: 'new-record', recordType: 'budget', recordVersion: 1,
  updatedAt: '2026-10-21T01:00:00.000Z', encryptedPayload: new Uint8Array([2]),
};
const event: StoredEvent = {
  eventId: 'new-event', recordId: record.recordId, recordType: 'budget',
  action: 'create', deviceId: 'test-device', deviceSeq: 3,
  createdAt: record.updatedAt, encryptedPatch: new Uint8Array([3]),
};
it('accepts a fresh encrypted record with matching revisions', () => {
  expect(() => assertAppendOnlyBudgetResolution(plan, record, event, 4, 6)).not.toThrow();
});
it.each([
  [record, event, 5, 6], [record, event, 4, 7],
  [{ ...record, recordId: 'source' }, { ...event, recordId: 'source' }, 4, 6],
  [record, { ...event, action: 'update' as const }, 4, 6],
  [record, { ...event, recordId: 'wrong-id' }, 4, 6],
])('rejects stale revision or destructive append inputs', (r, e, local, cloud) => {
  expect(() => assertAppendOnlyBudgetResolution(plan, r, e, local, cloud)).toThrow();
});

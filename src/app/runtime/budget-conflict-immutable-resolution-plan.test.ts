import { expect, it } from 'vitest';
import { planImmutableBudgetConflictResolution } from './budget-conflict-immutable-resolution-plan';
const context = {
  expectedAccountId: 'account', remoteAccountId: 'account',
  expectedVaultId: 'vault', remoteVaultId: 'vault',
  expectedCloudRevision: 5, downloadedCloudRevision: 5, latestCloudRevision: 5,
  localRevisionAtRead: 7, localRevisionBeforeDisplay: 7, unlocked: true,
};
const comparison = {
  candidates: [{ recordId: 'budget-a', month: '2026-10-01', localLimitMinor: 100000, remoteLimitMinor: 200000 }],
  unresolvedNonBudgetRecordCount: 0, unresolvedEventCount: 0,
};
const selection = {
  recordId: 'budget-a', month: '2026-10-01', choice: 'cloud' as const,
  expectedLocalLimitMinor: 100000, expectedCloudLimitMinor: 200000,
};
it('produces only an immutable append proposal with both expected revisions', () => {
  const original = structuredClone(comparison);
  expect(planImmutableBudgetConflictResolution(context, comparison, selection)).toEqual({
    sourceRecordId: 'budget-a', month: '2026-10-01', chosenLimitMinor: 200000,
    expectedLocalRevision: 7, expectedCloudRevision: 5, mode: 'append-new-budget',
  });
  expect(comparison).toEqual(original);
});
it('refuses stale or incomplete review before proposing a write', () => {
  expect(() => planImmutableBudgetConflictResolution({ ...context, localRevisionBeforeDisplay: 8 }, comparison, selection)).toThrow();
  expect(() => planImmutableBudgetConflictResolution(context, { ...comparison, unresolvedEventCount: 1 }, selection)).toThrow();
  expect(() => planImmutableBudgetConflictResolution(context, {
    ...comparison, candidates: [...comparison.candidates, { ...comparison.candidates[0]!, recordId: 'budget-b' }],
  }, selection)).toThrow('all budget collisions');
});

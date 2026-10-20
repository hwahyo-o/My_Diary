import { expect, it } from 'vitest';
import { preflightBudgetConflictConfirmation } from './budget-conflict-confirmation-preflight';

const context = {
  expectedAccountId: 'account', remoteAccountId: 'account',
  expectedVaultId: 'vault', remoteVaultId: 'vault',
  expectedCloudRevision: 5, downloadedCloudRevision: 5, latestCloudRevision: 5,
  localRevisionAtRead: 7, localRevisionBeforeDisplay: 7, unlocked: true,
};
const comparison = {
  candidates: [{ recordId: 'shared', month: '2026-10-01', localLimitMinor: 100000, remoteLimitMinor: 200000 }],
  unresolvedNonBudgetRecordCount: 0, unresolvedEventCount: 0,
};
const choice = {
  recordId: 'shared', month: '2026-10-01', choice: 'local' as const,
  expectedLocalLimitMinor: 100000, expectedCloudLimitMinor: 200000,
};
it('permits only a verified in-memory choice', () => {
  expect(preflightBudgetConflictConfirmation(context, comparison, choice).selectedLimitMinor).toBe(100000);
});
it('refuses changed local or cloud revisions, locked sessions and wrong Vault', () => {
  for (const override of [
    { latestCloudRevision: 6 }, { localRevisionBeforeDisplay: 8 },
    { unlocked: false }, { remoteVaultId: 'other' },
  ]) {
    expect(() => preflightBudgetConflictConfirmation({ ...context, ...override }, comparison, choice)).toThrow();
  }
});
it('refuses missing candidates, changed amounts and other unresolved conflicts', () => {
  expect(() => preflightBudgetConflictConfirmation(context, { ...comparison, candidates: [] }, choice)).toThrow();
  expect(() => preflightBudgetConflictConfirmation(context, comparison, { ...choice, expectedCloudLimitMinor: 9 })).toThrow();
  expect(() => preflightBudgetConflictConfirmation(context, { ...comparison, unresolvedEventCount: 1 }, choice)).toThrow();
});

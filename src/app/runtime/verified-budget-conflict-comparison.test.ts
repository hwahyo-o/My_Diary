import { expect, it } from 'vitest';
import type { Budget } from '../../domain/budgets/types';
import type { VerifiedConflictReviewContext } from './cloud-conflict-review-validation';
import { buildVerifiedBudgetConflictComparison } from './verified-budget-conflict-comparison';

const context: VerifiedConflictReviewContext = {
  expectedAccountId: 'account', remoteAccountId: 'account',
  expectedVaultId: 'vault', remoteVaultId: 'vault',
  expectedCloudRevision: 5, downloadedCloudRevision: 5, latestCloudRevision: 5,
  localRevisionAtRead: 7, localRevisionBeforeDisplay: 7, unlocked: true,
};
const make = (id: string, amount: number): Budget => ({
  id: id as Budget['id'], version: 1,
  createdAt: '2026-10-20T00:00:00.000Z' as Budget['createdAt'],
  updatedAt: '2026-10-20T00:00:00.000Z' as Budget['updatedAt'],
  month: '2026-10-01' as Budget['month'], limitMinor: amount, alertPercents: [50,80,100],
});
const plan = { recordIds: ['shared','other-type'], eventIds: ['event-id'], requiresManualReview: true };
it('shows verified local and remote budget amounts without choosing or changing either', () => {
  const local = [make('shared', 100000)];
  const remote = [make('shared', 200000)];
  const result = buildVerifiedBudgetConflictComparison(context, plan, local, remote);
  expect(result.candidates).toEqual([{
    recordId: 'shared', month: '2026-10-01',
    localLimitMinor: 100000, remoteLimitMinor: 200000,
  }]);
  expect(result.unresolvedNonBudgetRecordCount).toBe(1);
  expect(result.unresolvedEventCount).toBe(1);
  expect(local[0]!.limitMinor).toBe(100000);
  expect(remote[0]!.limitMinor).toBe(200000);
});
it('rejects a stale cloud revision before exposing any amounts', () => {
  expect(() => buildVerifiedBudgetConflictComparison(
    { ...context, latestCloudRevision: 6 }, plan,
    [make('shared', 100000)], [make('shared', 200000)],
  )).toThrow('stale');
});
it('rejects mismatched months and invalid financial amounts', () => {
  expect(() => buildVerifiedBudgetConflictComparison(context, plan,
    [make('shared', 100000)],
    [{ ...make('shared', 200000), month: '2026-09-01' as Budget['month'] }],
  )).toThrow('inconsistent');
  expect(() => buildVerifiedBudgetConflictComparison(context, plan,
    [make('shared', -1)], [make('shared', 200000)],
  )).toThrow('inconsistent');
});

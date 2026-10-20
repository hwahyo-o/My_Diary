import { expect, it } from 'vitest';
import { validateBudgetConflictSelection } from './budget-conflict-choice-validation';
const comparison = {
  candidates: [{ recordId: 'shared', month: '2026-10-01', localLimitMinor: 100000, remoteLimitMinor: 200000 }],
  unresolvedNonBudgetRecordCount: 0, unresolvedEventCount: 0,
};
const choice = { recordId: 'shared', month: '2026-10-01', choice: 'cloud' as const,
  expectedLocalLimitMinor: 100000, expectedCloudLimitMinor: 200000 };
it('selects an explicitly confirmed verified amount without mutating either candidate', () => {
  expect(validateBudgetConflictSelection(comparison, choice).selectedLimitMinor).toBe(200000);
  expect(comparison.candidates[0]!.localLimitMinor).toBe(100000);
});
it('rejects stale, unknown and unresolved non-budget selections', () => {
  expect(() => validateBudgetConflictSelection(comparison, { ...choice, expectedCloudLimitMinor: 300000 })).toThrow('changed');
  expect(() => validateBudgetConflictSelection(comparison, { ...choice, recordId: 'not-a-candidate' })).toThrow('verified');
  expect(() => validateBudgetConflictSelection({ ...comparison, unresolvedEventCount: 1 }, choice)).toThrow('Other encrypted');
});

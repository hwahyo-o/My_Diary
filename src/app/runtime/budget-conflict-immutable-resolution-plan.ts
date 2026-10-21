import type { VerifiedConflictReviewContext } from './cloud-conflict-review-validation';
import type { BudgetConflictComparison } from './verified-budget-conflict-comparison';
import type { BudgetConflictSelection } from './budget-conflict-choice-validation';
import { preflightBudgetConflictConfirmation } from './budget-conflict-confirmation-preflight';

export interface ImmutableBudgetResolutionPlan {
  readonly sourceRecordId: string;
  readonly month: string;
  readonly chosenLimitMinor: number;
  readonly expectedLocalRevision: number;
  readonly expectedCloudRevision: number;
  readonly mode: 'append-new-budget';
}

/**
 * Constructs a proposal only. The original conflicting encrypted records and events
 * must never be overwritten or removed by a future resolution transaction.
 * A future caller must re-read both revisions and use local and server CAS.
 */
export function planImmutableBudgetConflictResolution(
  context: VerifiedConflictReviewContext,
  comparison: BudgetConflictComparison,
  selection: BudgetConflictSelection,
): ImmutableBudgetResolutionPlan {
  const chosen = preflightBudgetConflictConfirmation(context, comparison, selection);
  if (!Number.isSafeInteger(chosen.selectedLimitMinor) || chosen.selectedLimitMinor < 0) {
    throw new Error('Invalid budget amount.');
  }
  if (comparison.candidates.length !== 1) {
    throw new Error('Resolve all budget collisions together before committing.');
  }
  return {
    sourceRecordId: chosen.recordId,
    month: chosen.month,
    chosenLimitMinor: chosen.selectedLimitMinor,
    expectedLocalRevision: context.localRevisionAtRead,
    expectedCloudRevision: context.expectedCloudRevision,
    mode: 'append-new-budget',
  };
}

import type { BudgetConflictComparison } from './verified-budget-conflict-comparison';
import type { VerifiedConflictReviewContext } from './cloud-conflict-review-validation';
import { assertVerifiedConflictReview } from './cloud-conflict-review-validation';
import {
  validateBudgetConflictSelection,
  type BudgetConflictSelection,
} from './budget-conflict-choice-validation';

/**
 * Preflight only: recheck identities, active session and revisions.
 * The caller must still re-fetch and verify both source snapshots before any write.
 * No persistence, network access or cloud conflict clearing occurs here.
 */
export function preflightBudgetConflictConfirmation(
  context: VerifiedConflictReviewContext,
  comparison: BudgetConflictComparison,
  selection: BudgetConflictSelection,
): { readonly recordId: string; readonly month: string; readonly selectedLimitMinor: number } {
  assertVerifiedConflictReview(context, {
    recordIds: comparison.candidates.map((item) => item.recordId),
    eventIds: [],
    requiresManualReview: comparison.candidates.length > 0,
  });
  return validateBudgetConflictSelection(comparison, selection);
}

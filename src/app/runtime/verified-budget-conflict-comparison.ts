import type { Budget } from '../../domain/budgets/types';
import type { CloudConflictReviewPlan } from './cloud-conflict-review-plan';
import {
  assertVerifiedConflictReview,
  type VerifiedConflictReviewContext,
} from './cloud-conflict-review-validation';

/** Internal, read-only representation. Only create inside an unlocked verified Vault. */
export interface BudgetConflictComparison {
  readonly candidates: readonly {
    readonly recordId: string;
    readonly month: string;
    readonly localLimitMinor: number;
    readonly remoteLimitMinor: number;
  }[];
  readonly unresolvedNonBudgetRecordCount: number;
  readonly unresolvedEventCount: number;
}

/**
 * Compare already authenticated and decrypted budget records.
 * This helper never chooses, saves, deletes, merges or uploads anything.
 * The caller must first authenticate and decrypt both snapshots within the unlocked Vault.
 */
export function buildVerifiedBudgetConflictComparison(
  context: VerifiedConflictReviewContext,
  plan: CloudConflictReviewPlan,
  localBudgets: readonly Budget[],
  remoteBudgets: readonly Budget[],
): BudgetConflictComparison {
  assertVerifiedConflictReview(context, plan);
  const local = new Map<string, Budget>(localBudgets.map((b) => [b.id, b]));
  const remote = new Map<string, Budget>(remoteBudgets.map((b) => [b.id, b]));
  const candidates: BudgetConflictComparison['candidates'][number][] = [];
  for (const id of new Set(plan.recordIds)) {
    const a = local.get(id);
    const b = remote.get(id);
    if (!a || !b) continue;
    if (a.month !== b.month ||
        !Number.isSafeInteger(a.limitMinor) || a.limitMinor < 0 ||
        !Number.isSafeInteger(b.limitMinor) || b.limitMinor < 0) {
      throw new Error('Budget conflict data is inconsistent; refresh before reviewing.');
    }
    candidates.push({
      recordId: id, month: a.month,
      localLimitMinor: a.limitMinor, remoteLimitMinor: b.limitMinor,
    });
  }
  return {
    candidates,
    unresolvedNonBudgetRecordCount: Math.max(0, new Set(plan.recordIds).size - candidates.length),
    unresolvedEventCount: new Set(plan.eventIds).size,
  };
}

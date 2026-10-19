import type { Budget } from '../../domain/budgets/types';
import type { ISODate } from '../../domain/shared/types';

type BudgetCandidate = Pick<Budget, 'id' | 'month' | 'updatedAt' | 'limitMinor'>;

export interface MonthlyBudgetInspection<T extends BudgetCandidate> {
  readonly selected: T | undefined;
  readonly alternatives: readonly T[];
  readonly hasDifferingLimits: boolean;
}

/**
 * Inspect the decrypted same-month candidates without removing any records.
 * A differing limit is a review candidate, NOT proof of simultaneous editing:
 * normal sequential budget changes also create historical records.
 */
export function inspectMonthlyBudgets<T extends BudgetCandidate>(
  budgets: readonly T[],
  month: ISODate,
): MonthlyBudgetInspection<T> {
  const ordered = budgets
    .filter((budget) => budget.month === month)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
  const selected = ordered[0];
  return {
    selected,
    alternatives: ordered.slice(1),
    hasDifferingLimits: selected !== undefined
      && ordered.some((budget) => budget.limitMinor !== selected.limitMinor),
  };
}

/**
 * Requires an explicit candidate ID chosen by the user. This function is pure:
 * it never deletes history, mutates the selected record, or starts cloud sync.
 * The caller must separately authenticate/authorize and persist any decision.
 */
export function selectBudgetCandidateForReview<T extends BudgetCandidate>(
  budgets: readonly T[],
  month: ISODate,
  chosenId: T['id'],
): T {
  const inspection = inspectMonthlyBudgets(budgets, month);
  const candidates = [inspection.selected, ...inspection.alternatives]
    .filter((item): item is T => item !== undefined);
  const chosen = candidates.find((budget) => budget.id === chosenId);
  if (!chosen) {
    throw new Error('Selected budget candidate is no longer available for this month.');
  }
  return chosen;
}

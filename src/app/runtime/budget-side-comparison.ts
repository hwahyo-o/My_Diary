import type { Budget } from '../../domain/budgets/types';
import type { ISODate } from '../../domain/shared/types';
import { inspectMonthlyBudgets } from './budget-candidates';

type Candidate = Pick<Budget, 'id' | 'month' | 'updatedAt' | 'limitMinor'>;
export interface BudgetSideSummary {
  readonly latestId: string | null;
  readonly latestLimitMinor: number | null;
  readonly recordIds: readonly string[];
}
export interface BudgetSideComparison {
  readonly local: BudgetSideSummary;
  readonly remote: BudgetSideSummary;
  readonly sameLatestRecord: boolean;
  readonly requiresReview: boolean;
}

function summary(budgets: readonly Candidate[], month: ISODate): BudgetSideSummary {
  const { selected, alternatives } = inspectMonthlyBudgets(budgets, month);
  return {
    latestId: selected?.id ?? null,
    latestLimitMinor: selected?.limitMinor ?? null,
    recordIds: [selected, ...alternatives].filter((v): v is Candidate => v !== undefined).map((v) => v.id),
  };
}

/**
 * Pure decrypted comparison for a future authenticated manual-review UI.
 * Different IDs do not establish concurrency; do not resolve, merge or upload here.
 * Call only in an unlocked session after verifying the cloud snapshot identity.
 */
export function compareMonthlyBudgetSides(
  localBudgets: readonly Candidate[],
  remoteBudgets: readonly Candidate[],
  month: ISODate,
): BudgetSideComparison {
  const local = summary(localBudgets, month);
  const remote = summary(remoteBudgets, month);
  const sameLatestRecord = local.latestId === remote.latestId && local.latestLimitMinor === remote.latestLimitMinor;
  const sameRecords = local.recordIds.length === remote.recordIds.length
    && local.recordIds.every((id) => remote.recordIds.includes(id));
  return { local, remote, sameLatestRecord, requiresReview: !sameLatestRecord || !sameRecords };
}

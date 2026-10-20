import type { BudgetConflictComparison } from './verified-budget-conflict-comparison';
export type BudgetConflictChoice = 'local' | 'cloud';
export interface BudgetConflictSelection {
  readonly recordId: string;
  readonly month: string;
  readonly choice: BudgetConflictChoice;
  readonly expectedLocalLimitMinor: number;
  readonly expectedCloudLimitMinor: number;
}
/** Pure check; never commits a financial choice or uploads data. */
export function validateBudgetConflictSelection(
  comparison: BudgetConflictComparison,
  selection: BudgetConflictSelection,
): { readonly recordId: string; readonly month: string; readonly selectedLimitMinor: number } {
  if (selection.choice !== 'local' && selection.choice !== 'cloud') {
    throw new Error('Unknown conflict resolution choice.');
  }
  if (comparison.unresolvedNonBudgetRecordCount > 0 || comparison.unresolvedEventCount > 0) {
    throw new Error('Other encrypted conflicts must be reviewed before any resolution.');
  }
  const matches = comparison.candidates.filter((item) =>
    item.recordId === selection.recordId && item.month === selection.month);
  if (matches.length !== 1) throw new Error('Conflict choice is not from the verified comparison.');
  const candidate = matches[0]!;
  if (candidate.localLimitMinor !== selection.expectedLocalLimitMinor ||
      candidate.remoteLimitMinor !== selection.expectedCloudLimitMinor) {
    throw new Error('Conflict comparison changed; review again before choosing.');
  }
  return {
    recordId: candidate.recordId,
    month: candidate.month,
    selectedLimitMinor: selection.choice === 'local'
      ? candidate.localLimitMinor : candidate.remoteLimitMinor,
  };
}

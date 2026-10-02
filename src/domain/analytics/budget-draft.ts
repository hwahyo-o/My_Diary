import type { ISODate } from '../shared/types';
import type { Transaction } from '../transactions/types';
import { getIncomeExpenseImpact } from '../transactions/accounting';

export interface MonthStartBudgetDraftInput {
  readonly targetMonth: ISODate;
  readonly transactions: readonly Transaction[];
  readonly scheduledFixedMinor: number;
  readonly savingTargetMinor: number;
}

export interface MonthStartBudgetDraft {
  readonly contextMonths: readonly string[];
  readonly meanExpenseMinor: number;
  readonly medianExpenseMinor: number;
  readonly scheduledFixedMinor: number;
  readonly savingTargetMinor: number;
  readonly suggestedLimitMinor: number;
  readonly confirmed: false;
}

function previousMonth(year: number, month: number, offset: number): string {
  const date = new Date(Date.UTC(year, month - 1 - offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle] ?? 0
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function createMonthStartBudgetDraft(input: MonthStartBudgetDraftInput): MonthStartBudgetDraft {
  const [year, month] = input.targetMonth.split('-').map(Number);
  if (year === undefined || month === undefined) throw new TypeError('Invalid target month.');

  const contextMonths = [3, 2, 1].map((offset) => previousMonth(year, month, offset));
  const totals = contextMonths.map((monthKey) => input.transactions
    .filter((transaction) => !transaction.deletedAt && transaction.occurredAt.startsWith(monthKey))
    .reduce((sum, transaction) => sum + getIncomeExpenseImpact(transaction).expenseMinor, 0));

  const meanExpenseMinor = totals.length === 0 ? 0 : Math.round(totals.reduce((sum, value) => sum + value, 0) / totals.length);
  const medianExpenseMinor = Math.round(median(totals));

  return {
    contextMonths,
    meanExpenseMinor,
    medianExpenseMinor,
    scheduledFixedMinor: input.scheduledFixedMinor,
    savingTargetMinor: input.savingTargetMinor,
    suggestedLimitMinor: Math.max(meanExpenseMinor, input.scheduledFixedMinor),
    confirmed: false,
  };
}

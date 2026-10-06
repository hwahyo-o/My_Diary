import type { Transaction } from '../transactions/types';
import { getIncomeExpenseImpact } from '../transactions/accounting';

export interface CoreAnalytics {
  readonly incomeMinor: number;
  readonly expenseMinor: number;
  readonly netCashflowMinor: number;
  readonly fixedMinor: number;
  readonly variableMinor: number;
  readonly mixedMinor: number;
  readonly categoryTotals: Readonly<Record<string, number>>;
}

export function selectCoreAnalytics(transactions: readonly Transaction[]): CoreAnalytics {
  let incomeMinor = 0;
  let expenseMinor = 0;
  let fixedMinor = 0;
  let variableMinor = 0;
  let mixedMinor = 0;
  const categoryTotals: Record<string, number> = {};

  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    const impact = getIncomeExpenseImpact(transaction);
    incomeMinor += impact.incomeMinor;
    expenseMinor += impact.expenseMinor;

    if (impact.expenseMinor <= 0) continue;

    if (transaction.type === 'expense') {
      if (transaction.fixedVariable === 'fixed') fixedMinor += impact.expenseMinor;
      else if (transaction.fixedVariable === 'mixed') mixedMinor += impact.expenseMinor;
      else variableMinor += impact.expenseMinor;
    }

    if (transaction.categoryId) {
      categoryTotals[transaction.categoryId] = (categoryTotals[transaction.categoryId] ?? 0) + impact.expenseMinor;
    }
  }

  return {
    incomeMinor,
    expenseMinor,
    netCashflowMinor: incomeMinor - expenseMinor,
    fixedMinor,
    variableMinor,
    mixedMinor,
    categoryTotals,
  };
}

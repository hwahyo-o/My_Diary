import type { ISODate, ISODateTime, UUID } from '../shared/types';
import type { Transaction } from '../transactions/types';
import { selectCoreAnalytics } from '../analytics/core';
import { scoreReportConfidence } from './confidence';
import type { Report, ReportType } from './types';

export interface GenerateMonthlyReportInput {
  readonly id: UUID;
  readonly type: Extract<ReportType, 'month_start' | 'month_end'>;
  readonly targetMonth: ISODate;
  readonly transactions: readonly Transaction[];
  readonly sourceRevision: number;
  readonly createdAt: ISODateTime;
  readonly comparisonMonths: number;
  readonly accountCoverage: number;
  readonly staleValuationCount: number;
}

function endOfMonth(monthStart: ISODate): ISODate {
  const [year, month] = monthStart.split('-').map(Number);
  if (year === undefined || month === undefined) throw new TypeError('Invalid month.');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` as ISODate;
}

function monthKey(monthStart: ISODate): string {
  return monthStart.slice(0, 7);
}

export function generateMonthlyReport(input: GenerateMonthlyReportInput): Report {
  const key = monthKey(input.targetMonth);
  const scopedTransactions = input.transactions.filter((transaction) => transaction.occurredAt.startsWith(key));
  const analytics = selectCoreAnalytics(scopedTransactions);
  const eligibleExpenses = scopedTransactions.filter((transaction) => !transaction.deletedAt && transaction.type === 'expense');
  const uncategorized = eligibleExpenses.filter((transaction) => !transaction.categoryId).length;
  const transactionCoverage = scopedTransactions.length === 0 ? 0 : 1;
  const uncategorizedShare = eligibleExpenses.length === 0 ? 0 : uncategorized / eligibleExpenses.length;
  const confidence = scoreReportConfidence({
    transactionCoverage,
    uncategorizedShare,
    accountCoverage: input.accountCoverage,
    staleValuationCount: input.staleValuationCount,
    comparisonMonths: input.comparisonMonths,
  });

  const snapshot = Object.freeze({
    cashFlow: Object.freeze({
      incomeMinor: analytics.incomeMinor,
      expenseMinor: analytics.expenseMinor,
      netCashflowMinor: analytics.netCashflowMinor,
    }),
    fixedVariable: Object.freeze({
      fixedMinor: analytics.fixedMinor,
      variableMinor: analytics.variableMinor,
      mixedMinor: analytics.mixedMinor,
    }),
    categoryTotals: Object.freeze({ ...analytics.categoryTotals }),
  });

  return Object.freeze({
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    version: 1,
    type: input.type,
    periodStart: input.targetMonth,
    periodEnd: endOfMonth(input.targetMonth),
    sourceRevision: input.sourceRevision,
    confidence,
    snapshot,
  });
}

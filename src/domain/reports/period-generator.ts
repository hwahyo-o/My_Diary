import { selectCoreAnalytics } from '../analytics/core';
import type { ISODate, ISODateTime, UUID } from '../shared/types';
import type { Transaction } from '../transactions/types';
import { scoreReportConfidence } from './confidence';
import type { Report } from './types';

export interface GeneratePeriodReportInput {
  readonly id: UUID;
  readonly type: 'half_year' | 'year_end';
  readonly targetDate: ISODate;
  readonly transactions: readonly Transaction[];
  readonly sourceRevision: number;
  readonly createdAt: ISODateTime;
  readonly comparisonMonths: number;
  readonly accountCoverage: number;
  readonly staleValuationCount: number;
}

function rangeFor(type: GeneratePeriodReportInput['type'], targetDate: ISODate): { start: ISODate; end: ISODate } {
  const [yearText, monthText] = targetDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month)) throw new TypeError('Invalid target date.');

  if (type === 'year_end') {
    return {
      start: `${year}-01-01` as ISODate,
      end: `${year}-12-31` as ISODate,
    };
  }

  return month <= 6
    ? { start: `${year}-01-01` as ISODate, end: `${year}-06-30` as ISODate }
    : { start: `${year}-07-01` as ISODate, end: `${year}-12-31` as ISODate };
}

export function generatePeriodReport(input: GeneratePeriodReportInput): Report {
  const { start, end } = rangeFor(input.type, input.targetDate);
  const scopedTransactions = input.transactions.filter((transaction) => {
    const date = transaction.occurredAt.slice(0, 10);
    return date >= start && date <= end;
  });
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

  return Object.freeze({
    id: input.id,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    version: 1,
    type: input.type,
    periodStart: start,
    periodEnd: end,
    sourceRevision: input.sourceRevision,
    confidence,
    snapshot: Object.freeze({
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
    }),
  });
}

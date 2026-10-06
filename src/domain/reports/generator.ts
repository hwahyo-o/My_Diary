import type { ISODate, ISODateTime, UUID } from '../shared/types';
import type { Transaction } from '../transactions/types';
import { selectCoreAnalytics } from '../analytics/core';
import { scoreReportConfidence } from './confidence';
import type { Report, ReportType } from './types';

interface CommonReportInput {
  readonly id: UUID;
  readonly transactions: readonly Transaction[];
  readonly sourceRevision: number;
  readonly createdAt: ISODateTime;
  readonly comparisonMonths: number;
  readonly accountCoverage: number;
  readonly staleValuationCount: number;
}

export interface GenerateMonthlyReportInput extends CommonReportInput {
  readonly type: Extract<ReportType, 'month_start' | 'month_end'>;
  readonly targetMonth: ISODate;
}

export interface GeneratePeriodReportInput extends CommonReportInput {
  readonly type: Extract<ReportType, 'half_year' | 'year_end'>;
  readonly periodStart: ISODate;
}

function endOfMonth(monthStart: ISODate): ISODate {
  const [year, month] = monthStart.split('-').map(Number);
  if (year === undefined || month === undefined) throw new TypeError('Invalid month.');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` as ISODate;
}

function snapshotReport(
  input: CommonReportInput & { readonly type: ReportType; readonly periodStart: ISODate; readonly periodEnd: ISODate },
): Report {
  const scopedTransactions = input.transactions.filter((transaction) => {
    const day = transaction.occurredAt.slice(0, 10);
    return day >= input.periodStart && day <= input.periodEnd;
  });
  const analytics = selectCoreAnalytics(scopedTransactions);
  const eligibleExpenses = scopedTransactions.filter((transaction) => !transaction.deletedAt && transaction.type === 'expense');
  const uncategorized = eligibleExpenses.filter((transaction) => !transaction.categoryId).length;
  const confidence = scoreReportConfidence({
    transactionCoverage: scopedTransactions.length === 0 ? 0 : 1,
    uncategorizedShare: eligibleExpenses.length === 0 ? 0 : uncategorized / eligibleExpenses.length,
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
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    sourceRevision: input.sourceRevision,
    confidence,
    snapshot,
  });
}

export function generateMonthlyReport(input: GenerateMonthlyReportInput): Report {
  return snapshotReport({
    ...input,
    periodStart: input.targetMonth,
    periodEnd: endOfMonth(input.targetMonth),
  });
}

export function generatePeriodReport(input: GeneratePeriodReportInput): Report {
  const year = Number(input.periodStart.slice(0, 4));
  const month = Number(input.periodStart.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month)) throw new TypeError('Invalid period start.');
  const periodEnd = input.type === 'year_end'
    ? `${year}-12-31` as ISODate
    : month <= 6
      ? `${year}-06-30` as ISODate
      : `${year}-12-31` as ISODate;
  return snapshotReport({ ...input, periodEnd });
}

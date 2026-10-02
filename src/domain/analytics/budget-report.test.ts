import { describe, expect, it } from 'vitest';
import { parseISODate, parseISODateTime, parseUUID } from '../shared/types';
import type { Budget } from '../budgets/types';
import type { Transaction } from '../transactions/types';
import { selectBudgetUsage, selectTimeProgress } from './budget';
import { createMonthStartBudgetDraft } from './budget-draft';
import { selectCoreAnalytics } from './core';
import { generateMonthlyReport } from '../reports/generator';
import { scoreReportConfidence } from '../reports/confidence';
import { isReportStale } from '../reports/stale';

const accountId = parseUUID('11111111-1111-4111-8111-111111111111');
const budgetId = parseUUID('22222222-2222-4222-8222-222222222222');
const reportId = parseUUID('33333333-3333-4333-8333-333333333333');
const createdAt = parseISODateTime('2026-10-01T00:00:00+09:00');

function tx(index: number, partial: Partial<Transaction>): Transaction {
  return {
    id: parseUUID(`44444444-4444-4444-8444-${String(index).padStart(12, '0')}`),
    createdAt,
    updatedAt: createdAt,
    version: 1,
    type: 'expense',
    accountId,
    amountMinor: 10000,
    occurredAt: createdAt,
    categoryId: 'food',
    fixedVariable: 'variable',
    source: 'manual',
    ...partial,
  };
}

const budget: Budget = {
  id: budgetId,
  createdAt,
  updatedAt: createdAt,
  version: 1,
  month: parseISODate('2026-10-01'),
  limitMinor: 1_000_000,
  alertPercents: [50, 80, 100],
};

describe('T22 budget usage and time progress', () => {
  it('includes only eligible expense and applies thresholds', () => {
    const transactions = [
      tx(1, { type: 'expense', amountMinor: 400_000 }),
      tx(2, { type: 'transfer', amountMinor: 100_000 }),
      tx(3, { type: 'saving', amountMinor: 200_000 }),
      tx(4, { type: 'loan_payment', amountMinor: 210_000, principalMinor: 200_000, interestMinor: 10_000 }),
      tx(5, { type: 'investment_buy', amountMinor: 300_000, feeMinor: 2_000 }),
    ];

    const usage = selectBudgetUsage(budget, transactions);
    expect(usage.eligibleExpenseMinor).toBe(412_000);
    expect(usage.usagePercent).toBeCloseTo(41.2);
    expect(usage.status).toBe('ok');

    const custom = selectBudgetUsage({ ...budget, limitMinor: 500_000, alertPercents: [40, 70, 90] }, transactions);
    expect(custom.status).toBe('warning');
  });

  it('calculates inclusive local-calendar progress and early depletion gap', () => {
    const progress = selectTimeProgress(parseISODate('2026-10-01'), parseISODate('2026-10-16'));
    expect(progress).toBeCloseTo((16 / 31) * 100);

    const usage = selectBudgetUsage({ ...budget, limitMinor: 700_000 }, [tx(6, { amountMinor: 500_000 })], progress);
    expect(usage.earlyDepletion).toBe(true);
    expect(selectTimeProgress(parseISODate('2026-11-01'), parseISODate('2026-10-16'))).toBe(0);
    expect(selectTimeProgress(parseISODate('2026-10-01'), parseISODate('2026-11-03'))).toBe(100);
  });
});

describe('T23 month-start budget draft', () => {
  it('uses previous three completed months and keeps fixed/saving inputs separate', () => {
    const history = [
      tx(10, { amountMinor: 600_000, occurredAt: parseISODateTime('2026-07-10T12:00:00+09:00') }),
      tx(11, { amountMinor: 800_000, occurredAt: parseISODateTime('2026-08-10T12:00:00+09:00') }),
      tx(12, { amountMinor: 700_000, occurredAt: parseISODateTime('2026-09-10T12:00:00+09:00') }),
      tx(13, { amountMinor: 999_000, occurredAt: parseISODateTime('2026-10-01T12:00:00+09:00') }),
    ];

    const draft = createMonthStartBudgetDraft({
      targetMonth: parseISODate('2026-10-01'),
      transactions: history,
      scheduledFixedMinor: 300_000,
      savingTargetMinor: 500_000,
    });

    expect(draft.contextMonths).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(draft.meanExpenseMinor).toBe(700_000);
    expect(draft.medianExpenseMinor).toBe(700_000);
    expect(draft.scheduledFixedMinor).toBe(300_000);
    expect(draft.savingTargetMinor).toBe(500_000);
    expect(draft.confirmed).toBe(false);
  });
});

describe('T24 core analytics', () => {
  it('reuses accounting rules, excludes deleted transactions, and separates categories/fixed-variable totals', () => {
    const transactions = [
      tx(20, { type: 'income', amountMinor: 3_000_000, categoryId: 'salary' }),
      tx(21, { amountMinor: 400_000, categoryId: 'food', fixedVariable: 'variable' }),
      tx(22, { amountMinor: 200_000, categoryId: 'rent', fixedVariable: 'fixed' }),
      tx(23, { type: 'saving', amountMinor: 500_000 }),
      tx(24, { type: 'loan_payment', amountMinor: 210_000, principalMinor: 200_000, interestMinor: 10_000, categoryId: 'loan' }),
      tx(25, { amountMinor: 50_000, deletedAt: parseISODateTime('2026-10-20T10:00:00+09:00') }),
    ];

    const result = selectCoreAnalytics(transactions);
    expect(result.incomeMinor).toBe(3_000_000);
    expect(result.expenseMinor).toBe(610_000);
    expect(result.netCashflowMinor).toBe(2_390_000);
    expect(result.fixedMinor).toBe(200_000);
    expect(result.variableMinor).toBe(400_000);
    expect(result.categoryTotals.food).toBe(400_000);
    expect(result.categoryTotals.rent).toBe(200_000);
    expect(result.categoryTotals.loan).toBe(10_000);
  });
});

describe('T25-T27 report snapshots, confidence, and stale detection', () => {
  const transactions = [
    tx(30, { type: 'income', amountMinor: 3_000_000 }),
    tx(31, { amountMinor: 600_000, categoryId: 'food' }),
  ];

  it('creates immutable month-start/month-end snapshots tied to source revision', () => {
    const monthStart = generateMonthlyReport({
      id: reportId,
      type: 'month_start',
      targetMonth: parseISODate('2026-10-01'),
      transactions,
      sourceRevision: 7,
      createdAt,
      comparisonMonths: 3,
      accountCoverage: 1,
      staleValuationCount: 0,
    });
    expect(monthStart.periodStart).toBe('2026-10-01');
    expect(monthStart.periodEnd).toBe('2026-10-31');
    expect(monthStart.sourceRevision).toBe(7);
    expect(monthStart.snapshot.cashFlow.expenseMinor).toBe(600_000);

    const originalExpense = monthStart.snapshot.cashFlow.expenseMinor;
    const editedTransactions = [...transactions, tx(32, { amountMinor: 200_000 })];
    const regenerated = generateMonthlyReport({
      id: parseUUID('33333333-3333-4333-8333-333333333334'),
      type: 'month_end',
      targetMonth: parseISODate('2026-10-01'),
      transactions: editedTransactions,
      sourceRevision: 8,
      createdAt,
      comparisonMonths: 3,
      accountCoverage: 1,
      staleValuationCount: 0,
    });

    expect(monthStart.snapshot.cashFlow.expenseMinor).toBe(originalExpense);
    expect(regenerated.snapshot.cashFlow.expenseMinor).toBe(800_000);
    expect(isReportStale(monthStart, 8)).toBe(true);
    expect(isReportStale(regenerated, 8)).toBe(false);
  });

  it('degrades confidence when coverage/history/category quality or valuation freshness is weak', () => {
    expect(scoreReportConfidence({ transactionCoverage: 1, uncategorizedShare: 0, accountCoverage: 1, staleValuationCount: 0, comparisonMonths: 3 })).toBe('high');
    expect(scoreReportConfidence({ transactionCoverage: 0.8, uncategorizedShare: 0.25, accountCoverage: 0.8, staleValuationCount: 1, comparisonMonths: 2 })).toBe('medium');
    expect(scoreReportConfidence({ transactionCoverage: 0.4, uncategorizedShare: 0.6, accountCoverage: 0.4, staleValuationCount: 3, comparisonMonths: 0 })).toBe('low');
  });
});

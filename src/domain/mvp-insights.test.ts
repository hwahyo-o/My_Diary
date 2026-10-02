import { describe, expect, it } from 'vitest';
import type { Account } from './accounts/types';
import { analyzeAccountPurposes } from './accounts/purpose-analysis';
import type { Holding } from './holdings/types';
import { buildHoldingInsight } from './holdings/insights';
import { generatePeriodReport } from './reports/period-generator';
import { parseISODate, parseISODateTime, parseUUID } from './shared/types';
import type { Transaction } from './transactions/types';

const createdAt = parseISODateTime('2026-12-31T12:00:00+09:00');
const accountA = parseUUID('11111111-1111-4111-8111-111111111111');
const accountB = parseUUID('22222222-2222-4222-8222-222222222222');

function tx(id: number, occurredAt: string, type: Transaction['type'], amountMinor: number): Transaction {
  return {
    id: parseUUID(`33333333-3333-4333-8333-${String(id).padStart(12, '0')}`),
    createdAt,
    updatedAt: createdAt,
    version: 1,
    type,
    accountId: accountA,
    amountMinor,
    occurredAt: parseISODateTime(occurredAt),
    source: 'manual',
  };
}

describe('mandatory MVP period reports', () => {
  const transactions = [
    tx(1, '2026-01-10T12:00:00+09:00', 'income', 3_000_000),
    tx(2, '2026-03-10T12:00:00+09:00', 'expense', 400_000),
    tx(3, '2026-07-10T12:00:00+09:00', 'income', 2_000_000),
    tx(4, '2026-10-10T12:00:00+09:00', 'expense', 600_000),
  ];

  it('creates a first-half report over January through June only', () => {
    const report = generatePeriodReport({
      id: parseUUID('44444444-4444-4444-8444-444444444444'),
      type: 'half_year',
      targetDate: parseISODate('2026-04-01'),
      transactions,
      sourceRevision: 10,
      createdAt,
      comparisonMonths: 6,
      accountCoverage: 1,
      staleValuationCount: 0,
    });

    expect(report.periodStart).toBe('2026-01-01');
    expect(report.periodEnd).toBe('2026-06-30');
    expect(report.snapshot.cashFlow.incomeMinor).toBe(3_000_000);
    expect(report.snapshot.cashFlow.expenseMinor).toBe(400_000);
  });

  it('creates a year-end report over the full calendar year', () => {
    const report = generatePeriodReport({
      id: parseUUID('55555555-5555-4555-8555-555555555555'),
      type: 'year_end',
      targetDate: parseISODate('2026-12-31'),
      transactions,
      sourceRevision: 11,
      createdAt,
      comparisonMonths: 12,
      accountCoverage: 1,
      staleValuationCount: 0,
    });

    expect(report.periodStart).toBe('2026-01-01');
    expect(report.periodEnd).toBe('2026-12-31');
    expect(report.snapshot.cashFlow.incomeMinor).toBe(5_000_000);
    expect(report.snapshot.cashFlow.expenseMinor).toBe(1_000_000);
  });
});

describe('mandatory MVP account-purpose analysis', () => {
  it('groups included accounts by purpose and calculates balance share', () => {
    const accounts: Account[] = [
      { id: accountA, createdAt, updatedAt: createdAt, version: 1, name: '생활비', kind: 'checking', purpose: 'daily', includeNetWorth: true },
      { id: accountB, createdAt, updatedAt: createdAt, version: 1, name: '비상금', kind: 'savings', purpose: 'emergency', includeNetWorth: true },
      { id: parseUUID('66666666-6666-4666-8666-666666666666'), createdAt, updatedAt: createdAt, version: 1, name: '제외', kind: 'cash', purpose: 'other', includeNetWorth: false },
    ];

    const result = analyzeAccountPurposes(accounts, [
      { accountId: accountA, balanceMinor: 600_000 },
      { accountId: accountB, balanceMinor: 400_000 },
    ]);

    expect(result.totalIncludedBalanceMinor).toBe(1_000_000);
    expect(result.byPurpose.daily.balanceMinor).toBe(600_000);
    expect(result.byPurpose.daily.sharePercent).toBeCloseTo(60);
    expect(result.byPurpose.emergency.sharePercent).toBeCloseTo(40);
  });
});

describe('mandatory MVP per-holding insight', () => {
  it('returns gain/loss math plus a human-readable reason', () => {
    const holding: Holding = {
      id: parseUUID('77777777-7777-4777-8777-777777777777'),
      createdAt,
      updatedAt: createdAt,
      version: 1,
      accountId: accountA,
      ticker: 'TEST',
      quantity: '10',
      avgCostMinor: 10_000,
      marketValueMinor: 120_000,
      priceAsOf: parseISODate('2026-12-31'),
    };

    const insight = buildHoldingInsight(holding);
    expect(insight.costBasisMinor).toBe(100_000);
    expect(insight.unrealizedGainMinor).toBe(20_000);
    expect(insight.returnPercent).toBeCloseTo(20);
    expect(insight.direction).toBe('gain');
    expect(insight.reason.length).toBeGreaterThan(0);
  });
});

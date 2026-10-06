import { describe, expect, it } from 'vitest';
import { parseISODate, parseISODateTime, parseUUID } from '../shared/types';
import type { Account } from '../accounts/types';
import type { Holding } from '../holdings/types';
import type { Transaction } from '../transactions/types';
import { generatePeriodReport } from '../reports/generator';
import { selectAccountPurposeAnalysis } from './account-purpose';
import { selectHoldingInsights } from './holding-insights';

const createdAt = parseISODateTime('2026-10-01T00:00:00+09:00');
const accountId = parseUUID('11111111-1111-4111-8111-111111111111');

function tx(index: number, occurredAt: string, amountMinor: number, type: Transaction['type'] = 'expense'): Transaction {
  const common = {
    id: parseUUID(`44444444-4444-4444-8444-${String(index).padStart(12, '0')}`),
    createdAt,
    updatedAt: createdAt,
    version: 1,
    type,
    accountId,
    amountMinor,
    occurredAt: parseISODateTime(occurredAt),
    source: 'manual' as const,
  };

  return type === 'expense'
    ? { ...common, categoryId: 'living', fixedVariable: 'variable' }
    : common;
}

describe('MVP period reports', () => {
  const transactions = [
    tx(1, '2026-01-10T12:00:00+09:00', 3_000_000, 'income'),
    tx(2, '2026-03-10T12:00:00+09:00', 500_000),
    tx(3, '2026-06-30T12:00:00+09:00', 200_000),
    tx(4, '2026-07-01T12:00:00+09:00', 900_000),
    tx(5, '2026-12-20T12:00:00+09:00', 300_000),
  ];

  it('generates first-half report through June 30 and excludes July onward', () => {
    const report = generatePeriodReport({
      id: parseUUID('33333333-3333-4333-8333-333333333331'),
      type: 'half_year',
      periodStart: parseISODate('2026-01-01'),
      transactions,
      sourceRevision: 11,
      createdAt,
      comparisonMonths: 6,
      accountCoverage: 1,
      staleValuationCount: 0,
    });

    expect(report.periodStart).toBe('2026-01-01');
    expect(report.periodEnd).toBe('2026-06-30');
    expect(report.snapshot.cashFlow.incomeMinor).toBe(3_000_000);
    expect(report.snapshot.cashFlow.expenseMinor).toBe(700_000);
  });

  it('generates year-end report through December 31', () => {
    const report = generatePeriodReport({
      id: parseUUID('33333333-3333-4333-8333-333333333332'),
      type: 'year_end',
      periodStart: parseISODate('2026-01-01'),
      transactions,
      sourceRevision: 12,
      createdAt,
      comparisonMonths: 12,
      accountCoverage: 1,
      staleValuationCount: 0,
    });

    expect(report.periodEnd).toBe('2026-12-31');
    expect(report.snapshot.cashFlow.expenseMinor).toBe(1_900_000);
  });
});

describe('MVP account-purpose analysis', () => {
  const account = (idTail: string, partial: Partial<Account>): Account => ({
    id: parseUUID(`55555555-5555-4555-8555-${idTail}`),
    createdAt,
    updatedAt: createdAt,
    version: 1,
    name: '계좌',
    kind: 'checking',
    includeNetWorth: true,
    ...partial,
  });

  it('groups included asset balances by purpose and reports purpose coverage', () => {
    const daily = account('000000000001', { purpose: 'daily' });
    const saving = account('000000000002', { kind: 'savings', purpose: 'saving' });
    const unknown = account('000000000003', {});
    const loan = account('000000000004', { kind: 'loan', purpose: 'other' });
    const excluded = account('000000000005', { purpose: 'emergency', includeNetWorth: false });

    const result = selectAccountPurposeAnalysis(
      [daily, saving, unknown, loan, excluded],
      [
        { accountId: daily.id, balanceMinor: 800_000 },
        { accountId: saving.id, balanceMinor: 2_000_000 },
        { accountId: unknown.id, balanceMinor: 200_000 },
        { accountId: loan.id, balanceMinor: 5_000_000 },
        { accountId: excluded.id, balanceMinor: 9_000_000 },
      ],
    );

    expect(result.totalAssetBalanceMinor).toBe(3_000_000);
    expect(result.byPurpose.daily).toBe(800_000);
    expect(result.byPurpose.saving).toBe(2_000_000);
    expect(result.byPurpose.other).toBe(200_000);
    expect(result.purposeCoverage).toBeCloseTo(2 / 3);
  });
});

describe('MVP holding insights', () => {
  it('returns deterministic return/freshness insight and reason per holding', () => {
    const holding: Holding = {
      id: parseUUID('66666666-6666-4666-8666-666666666666'),
      createdAt,
      updatedAt: createdAt,
      version: 1,
      accountId,
      ticker: 'ABC',
      quantity: '10',
      avgCostMinor: 10_000,
      marketValueMinor: 120_000,
      priceAsOf: parseISODate('2026-10-01'),
    };

    const [insight] = selectHoldingInsights([holding], parseISODate('2026-10-06'));
    expect(insight).toMatchObject({
      holdingId: holding.id,
      ticker: 'ABC',
      costBasisMinor: 100_000,
      unrealizedChangeMinor: 20_000,
      returnPercent: 20,
      freshness: 'fresh',
      tone: 'gain',
    });
    expect(insight?.reason).toContain('평가손익');
    expect(insight?.reason).toContain('가격 기준일');
  });

  it('marks old valuations stale without turning the result into investment advice', () => {
    const holding: Holding = {
      id: parseUUID('66666666-6666-4666-8666-666666666667'),
      createdAt,
      updatedAt: createdAt,
      version: 1,
      accountId,
      ticker: 'OLD',
      quantity: '2',
      avgCostMinor: 50_000,
      marketValueMinor: 90_000,
      priceAsOf: parseISODate('2026-08-01'),
    };

    const [insight] = selectHoldingInsights([holding], parseISODate('2026-10-06'));
    expect(insight?.freshness).toBe('stale');
    expect(insight?.reason).toContain('66일');
    expect(insight?.reason).not.toMatch(/매수|매도|추천/);
  });
});

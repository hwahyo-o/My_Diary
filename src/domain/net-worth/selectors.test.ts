import { describe, expect, it } from 'vitest';
import type { Account } from '../accounts/types';
import type { Holding } from '../holdings/types';
import type { Loan } from '../loans/types';
import { parseISODate, parseISODateTime, parseUUID } from '../shared/types';
import { selectNetWorth } from './selectors';

const timestamp = parseISODateTime('2026-10-01T00:00:00+09:00');
const valuationDate = parseISODate('2026-10-01');
const id = (tail: string) => parseUUID(`123e4567-e89b-42d3-a456-426614174${tail}`);

const account = (
  tail: string,
  kind: Account['kind'],
  includeNetWorth = true,
): Account => ({
  id: id(tail),
  name: kind,
  kind,
  includeNetWorth,
  createdAt: timestamp,
  updatedAt: timestamp,
  version: 1,
});

const loan = (remainingPrincipalMinor: number): Loan => ({
  id: id('200'),
  accountId: id('002'),
  remainingPrincipalMinor,
  annualInterestRate: 4,
  createdAt: timestamp,
  updatedAt: timestamp,
  version: 1,
});

describe('selectNetWorth', () => {
  it('adds included cash and holdings and subtracts loan/card liabilities without double counting', () => {
    const accounts = [
      account('000', 'checking'),
      account('001', 'brokerage'),
      account('002', 'loan'),
      account('003', 'credit'),
      account('004', 'savings', false),
    ];
    const holdings: Holding[] = [
      {
        id: id('100'),
        accountId: id('001'),
        ticker: 'TEST',
        quantity: '10',
        avgCostMinor: 50000,
        marketValueMinor: 600000,
        priceAsOf: valuationDate,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
      },
    ];
    const loans: Loan[] = [{ ...loan(900000), annualInterestRate: 4.5 }];

    expect(
      selectNetWorth({
        accounts,
        balances: [
          { accountId: id('000'), balanceMinor: 2000000 },
          { accountId: id('001'), balanceMinor: 100000 },
          { accountId: id('004'), balanceMinor: 999999 },
        ],
        holdings,
        loans,
        creditLiabilities: [{ accountId: id('003'), outstandingMinor: 300000 }],
      }),
    ).toEqual({
      liquidAssetsMinor: 2100000,
      investmentAssetsMinor: 600000,
      totalAssetsMinor: 2700000,
      totalLiabilitiesMinor: 1200000,
      netWorthMinor: 1500000,
    });
  });

  it('keeps net worth unchanged when equal cash and loan principal are reduced', () => {
    const accounts = [account('000', 'checking'), account('002', 'loan')];
    const before = selectNetWorth({
      accounts,
      balances: [{ accountId: id('000'), balanceMinor: 1000000 }],
      holdings: [],
      loans: [loan(800000)],
    });
    const after = selectNetWorth({
      accounts,
      balances: [{ accountId: id('000'), balanceMinor: 800000 }],
      holdings: [],
      loans: [loan(600000)],
    });

    expect(before.netWorthMinor).toBe(200000);
    expect(after.netWorthMinor).toBe(200000);
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
import { openVaultDatabase, STORE_NAMES } from '../../storage/database';

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function dumpRecords(dbName: string): Promise<unknown[]> {
  const db = await openVaultDatabase(dbName);
  try {
    const tx = db.transaction(STORE_NAMES.records, 'readonly');
    return await requestValue(tx.objectStore(STORE_NAMES.records).getAll());
  } finally {
    db.close();
  }
}

describe('MVP encrypted finance runtime', () => {
  it('persists budget/accounts/holdings/loans encrypted and hydrates MVP analytics after unlock', async () => {
    const dbName = `mvp-finance-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({
      dbName,
      argon2Profile: 'test',
      now: () => new Date('2026-10-06T12:00:00+09:00'),
    });

    try {
      await runtime.createProfile({ nickname: '사용자', pin: '482951' });
      await runtime.saveBudget({ limitMinor: 1_000_000 });
      const dailyAccountId = await runtime.saveAccount({
        name: '생활비 통장',
        kind: 'checking',
        purpose: 'daily',
        balanceMinor: 800_000,
        includeNetWorth: true,
      });
      const brokerageId = await runtime.saveAccount({
        name: '투자 계좌',
        kind: 'brokerage',
        purpose: 'investment',
        balanceMinor: 100_000,
        includeNetWorth: true,
      });
      const loanAccountId = await runtime.saveAccount({
        name: '학자금 대출',
        kind: 'loan',
        purpose: 'other',
        balanceMinor: 0,
        includeNetWorth: true,
      });
      await runtime.saveHolding({
        accountId: brokerageId,
        ticker: 'ABC',
        quantity: '10',
        avgCostMinor: 10_000,
        marketValueMinor: 120_000,
        priceAsOf: '2026-10-01',
      });
      await runtime.saveLoan({
        accountId: loanAccountId,
        remainingPrincipalMinor: 300_000,
        annualInterestRate: 3.5,
      });
      await runtime.submitTransaction({ mode: 'direct', amountMinor: 250_000, memo: '생활비' });

      const snapshot = runtime.getSnapshot();
      expect(snapshot.dashboard.budget.limitMinor).toBe(1_000_000);
      expect(snapshot.dashboard.budget.usagePercent).toBe(25);
      expect(snapshot.assets.netWorthMinor).toBe(720_000);
      expect(snapshot.assets.accountPurpose.byPurpose.daily).toBe(800_000);
      expect(snapshot.assets.accountPurpose.byPurpose.investment).toBe(100_000);
      expect(snapshot.assets.holdings[0]).toMatchObject({
        ticker: 'ABC',
        unrealizedChangeMinor: 20_000,
        returnPercent: 20,
        freshness: 'fresh',
      });
      expect(snapshot.analytics.reports.map((report) => report.type)).toEqual([
        'month_start',
        'month_end',
        'half_year',
        'year_end',
      ]);

      const raw = JSON.stringify(await dumpRecords(dbName));
      expect(raw).not.toContain('생활비 통장');
      expect(raw).not.toContain('투자 계좌');
      expect(raw).not.toContain('학자금 대출');
      expect(raw).not.toContain('ABC');

      runtime.lock();
      await runtime.unlock('482951');
      const restored = runtime.getSnapshot();
      expect(restored.dashboard.budget.limitMinor).toBe(1_000_000);
      expect(restored.assets.accounts.some((account) => account.id === dailyAccountId)).toBe(true);
      expect(restored.assets.holdings[0]?.ticker).toBe('ABC');
    } finally {
      runtime.close();
    }
  });

  it('refuses finance writes while locked', async () => {
    const runtime = await BrowserRuntime.open({
      dbName: `mvp-finance-${crypto.randomUUID()}`,
      argon2Profile: 'test',
    });
    try {
      await runtime.createProfile({ nickname: '사용자', pin: '482951' });
      runtime.lock();
      await expect(runtime.saveBudget({ limitMinor: 100_000 })).rejects.toThrow(/locked/i);
      await expect(runtime.saveAccount({
        name: '잠김',
        kind: 'cash',
        purpose: 'daily',
        balanceMinor: 1,
        includeNetWorth: true,
      })).rejects.toThrow(/locked/i);
    } finally {
      runtime.close();
    }
  });
});

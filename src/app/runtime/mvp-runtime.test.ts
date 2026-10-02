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

async function allRecords(dbName: string): Promise<unknown[]> {
  const db = await openVaultDatabase(dbName);
  try {
    const tx = db.transaction(STORE_NAMES.records, 'readonly');
    return await requestValue(tx.objectStore(STORE_NAMES.records).getAll());
  } finally {
    db.close();
  }
}

describe('MVP production runtime data flow', () => {
  it('persists account/budget/holding state encrypted and hydrates calendar, assets, budget, and reports', async () => {
    const dbName = `mvp-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({
      dbName,
      argon2Profile: 'test',
      now: () => new Date('2026-10-15T12:00:00+09:00'),
    });

    try {
      await runtime.createProfile({ nickname: '예현', pin: '482951' });
      const savingsId = await runtime.saveAccount({
        name: '비상금 통장',
        kind: 'savings',
        purpose: 'emergency',
        openingBalanceMinor: 500_000,
        includeNetWorth: true,
      });
      const brokerageId = await runtime.saveAccount({
        name: '투자 계좌',
        kind: 'brokerage',
        purpose: 'investment',
        openingBalanceMinor: 200_000,
        includeNetWorth: true,
      });
      await runtime.saveHolding({
        accountId: brokerageId,
        ticker: 'TEST',
        quantity: '10',
        avgCostMinor: 10_000,
        marketValueMinor: 120_000,
        priceAsOf: '2026-10-15',
      });
      await runtime.setMonthlyBudget(100_000);

      await runtime.submitTransaction({ mode: 'direct', type: 'income', amountMinor: 1_000_000, memo: '급여' });
      await runtime.submitTransaction({ mode: 'direct', type: 'expense', amountMinor: 40_000, memo: '식비' });

      const snapshot = runtime.getSnapshot();
      expect(snapshot.dashboard.transactions).toHaveLength(2);
      expect(snapshot.dashboard.transactions.map((item) => item.type)).toEqual(['income', 'expense']);
      expect(snapshot.dashboard.budget.usagePercent).toBeCloseTo(40);
      expect(snapshot.dashboard.budget.remainingMinor).toBe(60_000);
      expect(snapshot.dashboard.assets.accounts.some((item) => item.id === savingsId && item.balanceMinor === 500_000)).toBe(true);
      expect(snapshot.dashboard.assets.holdings[0]?.returnPercent).toBeCloseTo(20);
      expect(snapshot.dashboard.assets.holdings[0]?.reason).toMatch(/20\.0%/);
      expect(snapshot.dashboard.assets.netWorthMinor).toBe(1_780_000);
      expect(snapshot.dashboard.reports.map((report) => report.type)).toEqual(['month_end', 'half_year', 'year_end']);
      expect(snapshot.dashboard.reports.every((report) => report.status === 'ready')).toBe(true);

      const serialized = JSON.stringify(await allRecords(dbName));
      expect(serialized).not.toContain('비상금 통장');
      expect(serialized).not.toContain('투자 계좌');
      expect(serialized).not.toContain('TEST');
      expect(serialized).not.toContain('급여');
      expect(serialized).not.toContain('식비');
    } finally {
      runtime.close();
    }
  });
});

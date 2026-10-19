import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('applies the latest budget update in the same month even when saved at the same timestamp', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `budget-updates-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '예산 검증', pin: '4829517304' });
    await runtime.submitTransaction({ mode: 'quick', text: '오늘 점심 30000원' });
    await runtime.saveBudget({ limitMinor: 100000 });
    expect(runtime.getSnapshot().dashboard.budget.remainingMinor).toBe(70000);
    await runtime.saveBudget({ limitMinor: 50000 });
    expect(runtime.getSnapshot().dashboard.budget).toMatchObject({
      limitMinor: 50000, usagePercent: 60, remainingMinor: 20000,
    });
    await runtime.saveBudget({ limitMinor: 20000 });
    expect(runtime.getSnapshot().dashboard.budget).toMatchObject({
      limitMinor: 20000, usagePercent: 150, remainingMinor: -10000, status: 'over',
    });
    runtime.lock();
    await runtime.unlock('4829517304');
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(20000);
  } finally {
    runtime.close();
  }
});

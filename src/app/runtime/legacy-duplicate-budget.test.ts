import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('selects a new budget over legacy same-month duplicate budgets without deleting history', async () => {
  let now = new Date('2026-10-19T05:00:00.000Z');
  const runtime = await BrowserRuntime.open({
    dbName: `legacy-budget-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => now,
  });
  try {
    await runtime.createProfile({ nickname: '예산 호환성', pin: '4829517304' });
    await runtime.submitTransaction({ mode: 'quick', text: '오늘 점심 30000원' });
    await runtime.saveBudget({ limitMinor: 100000 });
    await runtime.saveBudget({ limitMinor: 50000 });
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(50000);
    now = new Date('2026-10-19T04:59:59.000Z');
    await runtime.saveBudget({ limitMinor: 20000 });
    expect(runtime.getSnapshot().dashboard.budget).toMatchObject({
      limitMinor: 20000, remainingMinor: -10000, usagePercent: 150, status: 'over',
    });
    runtime.lock();
    await runtime.unlock('4829517304');
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(20000);
  } finally { runtime.close(); }
});

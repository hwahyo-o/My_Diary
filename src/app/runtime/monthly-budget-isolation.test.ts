import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('isolates September and October budgets and excludes transactions from other months', async () => {
  let clock = new Date('2026-09-30T05:00:00.000Z');
  const runtime = await BrowserRuntime.open({
    dbName: `budget-month-isolation-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => clock,
  });
  try {
    await runtime.createProfile({ nickname: '월별 예산 검증', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 100000 });
    await runtime.submitTransaction({ mode: 'quick', text: '오늘 점심 30000원' });
    expect(runtime.getSnapshot().dashboard.budget).toMatchObject({
      limitMinor: 100000, remainingMinor: 70000, usagePercent: 30,
    });

    clock = new Date('2026-10-19T05:00:00.000Z');
    await runtime.saveBudget({ limitMinor: 50000 });
    await runtime.submitTransaction({ mode: 'quick', text: '오늘 커피 12000원' });
    expect(runtime.getSnapshot().dashboard.budget).toMatchObject({
      limitMinor: 50000, remainingMinor: 38000, usagePercent: 24,
    });
    await runtime.saveBudget({ limitMinor: 20000 });
    expect(runtime.getSnapshot().dashboard.budget).toMatchObject({
      limitMinor: 20000, remainingMinor: 8000, usagePercent: 60,
    });

    clock = new Date('2026-09-30T05:00:00.000Z');
    await runtime.saveBudget({ limitMinor: 80000 });
    expect(runtime.getSnapshot().dashboard.budget).toMatchObject({
      limitMinor: 80000, remainingMinor: 50000, usagePercent: 37.5,
    });
    clock = new Date('2026-10-19T05:00:00.000Z');
    runtime.lock();
    await runtime.unlock('4829517304');
    expect(runtime.getSnapshot().dashboard.budget).toMatchObject({
      limitMinor: 20000, remainingMinor: 8000, usagePercent: 60,
    });
  } finally {
    runtime.close();
  }
});

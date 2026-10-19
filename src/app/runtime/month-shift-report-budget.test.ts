import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('moves edited transaction between months without leaking expense into current report or budget', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `month-shift-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '테스트 전용', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 100000 });
    await runtime.submitTransaction({ mode: 'quick', text: '오늘 점심 30000원' });
    let state = runtime.getSnapshot();
    let report = state.analytics.reports.find((item) => item.type === 'month_end');
    expect(report?.expenseMinor).toBe(30000);
    expect(state.dashboard.budget.remainingMinor).toBe(70000);
    const row = state.calendar.transactions[0]!;
    await runtime.updateTransaction({
      id: row.id, amountMinor: 30000,
      occurredAt: '2026-09-30T12:00:00.000+09:00',
      label: '9월 점심',
    });
    state = runtime.getSnapshot();
    report = state.analytics.reports.find((item) => item.type === 'month_end');
    expect(state.calendar.transactions).toHaveLength(1);
    expect(state.calendar.transactions[0]?.occurredAt.slice(0, 10)).toBe('2026-09-30');
    expect(report?.expenseMinor).toBe(0);
    expect(state.dashboard.budget).toMatchObject({
      usagePercent: 0, remainingMinor: 100000, status: 'ok',
    });
    await runtime.updateTransaction({
      id: row.id, amountMinor: 30000,
      occurredAt: '2026-10-01T12:00:00.000+09:00',
      label: '10월 점심',
    });
    state = runtime.getSnapshot();
    report = state.analytics.reports.find((item) => item.type === 'month_end');
    expect(report?.expenseMinor).toBe(30000);
    expect(state.dashboard.budget.remainingMinor).toBe(70000);
    runtime.lock();
    await runtime.unlock('4829517304');
    const reloaded = runtime.getSnapshot();
    expect(reloaded.analytics.reports.find((item) => item.type === 'month_end')?.expenseMinor).toBe(30000);
    expect(reloaded.dashboard.budget.remainingMinor).toBe(70000);
  } finally {
    runtime.close();
  }
});

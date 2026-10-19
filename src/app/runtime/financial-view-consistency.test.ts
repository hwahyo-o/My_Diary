import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('keeps calendar, dashboard, and analytics totals consistent after a mixed batch and unlock', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `view-consistency-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-15T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '테스트 전용', pin: '4829517304' });
    await runtime.submitTransaction({
      mode: 'batch',
      text: '오늘 월급 2000000원; 오늘 점심 8000원; 오늘 월세 500000원',
    });
    const state = runtime.getSnapshot();
    expect(state.calendar.transactions).toHaveLength(3);
    const income = state.calendar.transactions.filter((row) => row.direction === 'income')
      .reduce((total, row) => total + row.amountMinor, 0);
    const expense = state.calendar.transactions.filter((row) => row.direction === 'expense')
      .reduce((total, row) => total + row.amountMinor, 0);
    expect(income).toBe(2000000);
    expect(expense).toBe(508000);
    expect(state.dashboard.incomeMinor).toBe(income);
    expect(state.dashboard.expenseMinor).toBe(expense);
    expect(state.analytics.fixedMinor).toBe(500000);
    expect(state.analytics.variableMinor).toBe(8000);

    runtime.lock();
    await runtime.unlock('4829517304');
    const refreshed = runtime.getSnapshot();
    expect(refreshed.calendar.transactions).toHaveLength(3);
    expect(refreshed.dashboard.incomeMinor).toBe(income);
    expect(refreshed.dashboard.expenseMinor).toBe(expense);
    expect(refreshed.analytics.fixedMinor).toBe(500000);
    expect(refreshed.analytics.variableMinor).toBe(8000);
  } finally {
    runtime.close();
  }
});

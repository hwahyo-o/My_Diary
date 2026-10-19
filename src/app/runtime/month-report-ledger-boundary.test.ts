import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('matches monthly report income and expenses to its calendar ledger across month boundaries', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `month-report-integrity-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '리포트 검증', pin: '4829517304' });
    for (const text of [
      '2026-09-30 월급 2000000원',
      '2026-10-01 점심 8000원',
      '2026-10-19 월급 1500000원',
      '2026-10-19 커피 4500원',
    ]) {
      await runtime.submitTransaction({ mode: 'quick', text });
    }
    const state = runtime.getSnapshot();
    const report = state.analytics.reports.find((item) => item.type === 'month_end');
    expect(report).toBeDefined();
    expect(report?.periodStart).toBe('2026-10-01');
    expect(report?.periodEnd).toBe('2026-10-31');
    const inPeriod = state.calendar.transactions.filter((item) =>
      item.occurredAt.slice(0, 10) >= '2026-10-01'
      && item.occurredAt.slice(0, 10) <= '2026-10-31');
    const income = inPeriod.filter((item) => item.direction === 'income')
      .reduce((sum, item) => sum + item.amountMinor, 0);
    const expense = inPeriod.filter((item) => item.direction === 'expense')
      .reduce((sum, item) => sum + item.amountMinor, 0);
    expect(report?.incomeMinor).toBe(income);
    expect(report?.expenseMinor).toBe(expense);
    expect(report?.netCashflowMinor).toBe(income - expense);
    expect(report?.incomeMinor).toBe(1500000);
    expect(report?.expenseMinor).toBe(12500);
    runtime.lock();
    await runtime.unlock('4829517304');
    const reloaded = runtime.getSnapshot().analytics.reports.find((item) => item.type === 'month_end');
    expect(reloaded?.incomeMinor).toBe(income);
    expect(reloaded?.expenseMinor).toBe(expense);
  } finally {
    runtime.close();
  }
});

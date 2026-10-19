import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('excludes deleted transactions from the monthly report and restores the same totals after recovery and unlock', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `month-delete-restore-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  const monthReport = () => runtime.getSnapshot().analytics.reports.find((item) => item.type === 'month_end');
  try {
    await runtime.createProfile({ nickname: '검증 전용', pin: '4829517304' });
    await runtime.submitTransaction({ mode: 'quick', text: '오늘 월급 1500000원' });
    await runtime.submitTransaction({ mode: 'quick', text: '오늘 점심 12000원' });
    await runtime.submitTransaction({ mode: 'quick', text: '19일 전 커피 4500원' });
    expect(monthReport()).toMatchObject({ incomeMinor: 1500000, expenseMinor: 12000, netCashflowMinor: 1488000 });
    const lunch = runtime.getSnapshot().calendar.transactions.find((item) => item.amountMinor === 12000)!;
    await runtime.deleteTransaction(lunch.id);
    expect(monthReport()).toMatchObject({ incomeMinor: 1500000, expenseMinor: 0, netCashflowMinor: 1500000 });
    expect(runtime.getSnapshot().calendar.transactions.some((item) => item.id === lunch.id)).toBe(false);
    await runtime.restoreTransaction(lunch.id);
    expect(monthReport()).toMatchObject({ incomeMinor: 1500000, expenseMinor: 12000, netCashflowMinor: 1488000 });
    expect(runtime.getSnapshot().calendar.transactions.some((item) => item.id === lunch.id)).toBe(true);
    runtime.lock();
    await runtime.unlock('4829517304');
    expect(monthReport()).toMatchObject({ incomeMinor: 1500000, expenseMinor: 12000, netCashflowMinor: 1488000 });
  } finally {
    runtime.close();
  }
});

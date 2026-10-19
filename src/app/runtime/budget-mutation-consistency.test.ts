import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('recalculates budget use and overspend across transaction edits, deletion and restore', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `budget-mutation-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '예산 검증', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 100000 });
    await runtime.submitTransaction({ mode: 'quick', text: '오늘 점심 80000원' });
    let state = runtime.getSnapshot();
    expect(state.dashboard.budget).toMatchObject({
      limitMinor: 100000, usagePercent: 80, remainingMinor: 20000, status: 'danger',
    });
    const row = state.calendar.transactions[0]!;
    await runtime.updateTransaction({
      id: row.id, amountMinor: 120000, occurredAt: row.occurredAt, label: '점심 수정',
    });
    state = runtime.getSnapshot();
    expect(state.dashboard.budget).toMatchObject({
      usagePercent: 120, remainingMinor: -20000, status: 'over',
    });
    await runtime.deleteTransaction(row.id);
    state = runtime.getSnapshot();
    expect(state.dashboard.budget).toMatchObject({
      usagePercent: 0, remainingMinor: 100000, status: 'ok',
    });
    await runtime.restoreTransaction(row.id);
    state = runtime.getSnapshot();
    expect(state.dashboard.budget).toMatchObject({
      usagePercent: 120, remainingMinor: -20000, status: 'over',
    });
    runtime.lock();
    await runtime.unlock('4829517304');
    expect(runtime.getSnapshot().dashboard.budget).toMatchObject({
      usagePercent: 120, remainingMinor: -20000, status: 'over',
    });
  } finally {
    runtime.close();
  }
});

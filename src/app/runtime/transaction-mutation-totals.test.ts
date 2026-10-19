import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('recomputes calendar, dashboard and analytics after editing, deleting and restoring a transaction', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `mutation-totals-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '검증 전용', pin: '4829517304' });
    await runtime.submitTransaction({ mode: 'quick', text: '오늘 점심 8000원' });
    await runtime.submitTransaction({ mode: 'quick', text: '오늘 월세 500000원' });
    const before = runtime.getSnapshot();
    expect(before.dashboard.expenseMinor).toBe(508000);
    expect(before.analytics.fixedMinor).toBe(500000);
    expect(before.analytics.variableMinor).toBe(8000);

    const lunch = before.calendar.transactions.find((item) => item.amountMinor === 8000)!;
    await runtime.updateTransaction({
      id: lunch.id,
      amountMinor: 12000,
      occurredAt: lunch.occurredAt,
      label: '점심 수정',
    });
    const edited = runtime.getSnapshot();
    expect(edited.calendar.transactions.find((item) => item.id === lunch.id)?.amountMinor).toBe(12000);
    expect(edited.dashboard.expenseMinor).toBe(512000);
    expect(edited.analytics.variableMinor).toBe(12000);

    await runtime.deleteTransaction(lunch.id);
    const deleted = runtime.getSnapshot();
    expect(deleted.calendar.transactions.some((item) => item.id === lunch.id)).toBe(false);
    expect(deleted.dashboard.expenseMinor).toBe(500000);
    expect(deleted.analytics.variableMinor).toBe(0);
    expect(deleted.analytics.fixedMinor).toBe(500000);

    await runtime.restoreTransaction(lunch.id);
    const restored = runtime.getSnapshot();
    expect(restored.calendar.transactions.find((item) => item.id === lunch.id)?.amountMinor).toBe(12000);
    expect(restored.dashboard.expenseMinor).toBe(512000);
    expect(restored.analytics.variableMinor).toBe(12000);
    runtime.lock();
    await runtime.unlock('4829517304');
    expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(512000);
    expect(runtime.getSnapshot().calendar.transactions).toHaveLength(2);
  } finally {
    runtime.close();
  }
});

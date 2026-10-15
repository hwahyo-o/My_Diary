import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('persists reviewed batch amount, type, category and date instead of original suggestions', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `reviewed-batch-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-15T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '테스트 전용', pin: '4829517304' });
    const text = '점심 8000원; 커피 4500원';
    const suggestions = runtime.previewQuickBatch(text);
    expect(suggestions.entries).toHaveLength(2);
    const entries = [
      {
        text: suggestions.entries[0]!.text,
        amountMinor: 9500,
        transactionType: 'expense' as const,
        categoryId: 'transport',
        fixedVariable: 'fixed' as const,
        occurredAt: '2026-10-12T12:00:00.000+09:00',
      },
      {
        text: suggestions.entries[1]!.text,
        amountMinor: 6000,
        transactionType: 'income' as const,
        categoryId: 'uncategorized',
        fixedVariable: 'variable' as const,
        occurredAt: '2026-10-13T14:00:00.000+09:00',
      },
    ];
    await runtime.submitTransaction({ mode: 'batch', text, entries });
    const state = runtime.getSnapshot();
    expect(state.calendar.transactions).toHaveLength(2);
    expect(state.calendar.transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ amountMinor: 9500, type: 'expense', occurredAt: entries[0].occurredAt }),
      expect.objectContaining({ amountMinor: 6000, type: 'income', occurredAt: entries[1].occurredAt }),
    ]));
    expect(state.dashboard.expenseMinor).toBe(9500);
    expect(state.dashboard.incomeMinor).toBe(6000);
    expect(state.analytics.fixedMinor).toBe(9500);
  } finally {
    runtime.close();
  }
});

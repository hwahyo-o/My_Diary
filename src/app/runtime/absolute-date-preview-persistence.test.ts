import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it.each([
  ['2026-09-30 월급 2000000원', '2026-09-30', 'income', 2000000],
  ['2026.09.30 커피 4500원', '2026-09-30', 'expense', 4500],
  ['2026/10/01 점심 8000원', '2026-10-01', 'expense', 8000],
] as const)('persists absolute date preview exactly for %s', async (text, day, type, amount) => {
  const runtime = await BrowserRuntime.open({
    dbName: `absolute-preview-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '검증 전용', pin: '4829517304' });
    const preview = runtime.previewQuickTransaction(text);
    expect(preview.occurredAt.slice(0, 10)).toBe(day);
    expect(preview.amountMinor).toBe(amount);
    expect(preview.transactionType).toBe(type);
    expect(preview.needsReview).toBe(false);
    await runtime.submitTransaction({ mode: 'quick', text });
    const rows = runtime.getSnapshot().calendar.transactions;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amountMinor: preview.amountMinor,
      type: preview.transactionType,
      occurredAt: preview.occurredAt,
    });
  } finally {
    runtime.close();
  }
});

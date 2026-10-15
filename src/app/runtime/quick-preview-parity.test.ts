import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

describe('Quick Add preview/persistence parity', () => {
  it.each([
    ['그제 커피 4500원', 'expense', '2026-10-13', 4500],
    ['어제 월급 2000000원', 'income', '2026-10-14', 2000000],
    ['3일 전 점심 7500원', 'expense', '2026-10-12', 7500],
  ] as const)('persists the previewed amount, date and transaction type for %s', async (text, type, day, amount) => {
    const runtime = await BrowserRuntime.open({
      dbName: `preview-parity-${crypto.randomUUID()}`,
      argon2Profile: 'test',
      now: () => new Date('2026-10-15T05:00:00.000Z'),
    });
    try {
      await runtime.createProfile({ nickname: '미리보기 일치 테스트', pin: '4829517304' });
      const preview = runtime.previewQuickTransaction(text);
      expect(preview).toMatchObject({
        amountMinor: amount,
        transactionType: type,
        unresolvedAmount: false,
      });
      expect(preview.occurredAt.slice(0, 10)).toBe(day);
      await runtime.submitTransaction({ mode: 'quick', text });
      const entries = runtime.getSnapshot().calendar.transactions;
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        amountMinor: preview.amountMinor,
        type: preview.transactionType,
      });
      expect(entries[0]?.occurredAt.slice(0, 10)).toBe(preview.occurredAt.slice(0, 10));
      if (type === 'income') {
        expect(runtime.getSnapshot().dashboard.incomeMinor).toBe(amount);
      } else {
        expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(amount);
      }
    } finally {
      runtime.close();
    }
  });
});

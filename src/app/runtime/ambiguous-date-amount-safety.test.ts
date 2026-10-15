import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

describe('ambiguous Quick Add safety', () => {
  it('rejects conflicting relative dates without writing a transaction', async () => {
    const runtime = await BrowserRuntime.open({
      dbName: `date-conflict-${crypto.randomUUID()}`,
      argon2Profile: 'test',
      now: () => new Date('2026-10-15T05:00:00.000Z'),
    });
    try {
      await runtime.createProfile({ nickname: '테스트 전용', pin: '4829517304' });
      const text = '어제 그제 커피 4500원';
      expect(runtime.previewQuickTransaction(text).needsReview).toBe(true);
      await expect(runtime.submitTransaction({ mode: 'quick', text })).rejects.toThrow('requires review');
      expect(runtime.getSnapshot().calendar.transactions).toHaveLength(0);
      expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(0);
    } finally { runtime.close(); }
  });

  it('rejects combined conflicting dates, amounts and transaction type without any ledger write', async () => {
    const runtime = await BrowserRuntime.open({
      dbName: `compound-conflict-${crypto.randomUUID()}`,
      argon2Profile: 'test',
      now: () => new Date('2026-10-15T05:00:00.000Z'),
    });
    try {
      await runtime.createProfile({ nickname: '테스트 전용', pin: '4829517304' });
      const text = '어제 그제 월급으로 점심 8000원 커피 4500원';
      const preview = runtime.previewQuickTransaction(text);
      expect(preview.needsReview).toBe(true);
      expect(preview.multipleAmounts).toBe(true);
      await expect(runtime.submitTransaction({ mode: 'quick', text })).rejects.toThrow('Multiple amounts');
      expect(runtime.getSnapshot().calendar.transactions).toHaveLength(0);
      expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(0);
      expect(runtime.getSnapshot().dashboard.incomeMinor).toBe(0);
    } finally { runtime.close(); }
  });
});

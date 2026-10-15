import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

describe('mixed batch financial safety', () => {
  it('previews and saves income and dated expenses independently', async () => {
    const runtime = await BrowserRuntime.open({
      dbName: `mixed-batch-${crypto.randomUUID()}`,
      argon2Profile: 'test',
      now: () => new Date('2026-10-15T05:00:00.000Z'),
    });
    try {
      await runtime.createProfile({ nickname: '일괄 테스트', pin: '4829517304' });
      const text = '어제 점심 8000원; 그제 커피 4500원; 오늘 월급 2000000원';
      const preview = runtime.previewQuickBatch(text);
      expect(preview.valid).toBe(true);
      expect(preview.entries.map((entry) => entry.amountMinor)).toEqual([8000, 4500, 2000000]);
      expect(preview.entries.map((entry) => entry.transactionType)).toEqual(['expense', 'expense', 'income']);
      expect(preview.entries.map((entry) => entry.occurredAt.slice(0, 10))).toEqual(['2026-10-14', '2026-10-13', '2026-10-15']);
      await runtime.submitTransaction({ mode: 'batch', text });
      const after = runtime.getSnapshot();
      expect(after.calendar.transactions).toHaveLength(3);
      expect(after.dashboard.incomeMinor).toBe(2000000);
      expect(after.dashboard.expenseMinor).toBe(12500);
      for (const entry of preview.entries) {
        expect(after.calendar.transactions).toEqual(expect.arrayContaining([
          expect.objectContaining({
            occurredAt: entry.occurredAt,
            amountMinor: entry.amountMinor,
            type: entry.transactionType,
          }),
        ]));
      }
    } finally { runtime.close(); }
  });

  it('rejects a batch containing an ambiguous entry without persisting any partial results', async () => {
    const runtime = await BrowserRuntime.open({
      dbName: `ambiguous-batch-${crypto.randomUUID()}`,
      argon2Profile: 'test',
      now: () => new Date('2026-10-15T05:00:00.000Z'),
    });
    try {
      await runtime.createProfile({ nickname: '일괄 테스트', pin: '4829517304' });
      const text = '어제 점심 8000원; 그제 오늘 커피 4500원; 월급 2000000원';
      expect(runtime.previewQuickBatch(text).valid).toBe(false);
      await expect(runtime.submitTransaction({ mode: 'batch', text })).rejects.toThrow();
      const state = runtime.getSnapshot();
      expect(state.calendar.transactions).toHaveLength(0);
      expect(state.dashboard.incomeMinor).toBe(0);
      expect(state.dashboard.expenseMinor).toBe(0);
    } finally { runtime.close(); }
  });
});

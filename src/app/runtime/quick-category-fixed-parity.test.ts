import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

describe('Quick Add category and fixed/variable parity', () => {
  it.each([
    ['그제 커피 4500원', 'food', 'variable', 4500],
    ['어제 월세 500000원', 'housing', 'fixed', 500000],
    ['3일 전 택시 12000원', 'transport', 'variable', 12000],
    ['오늘 구독 9900원', 'subscription', 'fixed', 9900],
  ] as const)('matches stored analytics for %s', async (text, category, fixedVariable, amount) => {
    const runtime = await BrowserRuntime.open({
      dbName: `quick-category-parity-${crypto.randomUUID()}`,
      argon2Profile: 'test',
      now: () => new Date('2026-10-15T05:00:00.000Z'),
    });
    try {
      await runtime.createProfile({ nickname: '분류 일치 검증', pin: '4829517304' });
      const preview = runtime.previewQuickTransaction(text);
      expect(preview.categoryId).toBe(category);
      expect(preview.fixedVariable).toBe(fixedVariable);
      await runtime.submitTransaction({ mode: 'quick', text });
      const snapshot = runtime.getSnapshot();
      expect(snapshot.calendar.transactions).toHaveLength(1);
      expect(snapshot.calendar.transactions[0]?.amountMinor).toBe(amount);
      expect(snapshot.dashboard.expenseMinor).toBe(amount);
      expect(snapshot.analytics.fixedMinor).toBe(fixedVariable === 'fixed' ? amount : 0);
      expect(snapshot.analytics.variableMinor).toBe(fixedVariable === 'variable' ? amount : 0);
    } finally { runtime.close(); }
  });

  it('applies a user-selected fixed override in preview and stored analytics', async () => {
    const runtime = await BrowserRuntime.open({
      dbName: `quick-override-parity-${crypto.randomUUID()}`,
      argon2Profile: 'test',
    });
    try {
      await runtime.createProfile({ nickname: '분류 재설정 검증', pin: '4829517304' });
      await runtime.saveFixedVariableRule({ categoryId: 'food', mode: 'fixed' });
      const preview = runtime.previewQuickTransaction('커피 6500원');
      expect(preview.categoryId).toBe('food');
      expect(preview.fixedVariable).toBe('fixed');
      await runtime.submitTransaction({ mode: 'quick', text: '커피 6500원' });
      expect(runtime.getSnapshot().analytics.fixedMinor).toBe(6500);
      expect(runtime.getSnapshot().analytics.variableMinor).toBe(0);
    } finally { runtime.close(); }
  });
});

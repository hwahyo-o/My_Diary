import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BrowserRuntime } from '../../app/runtime/browser-runtime';
import { classifyTransactionText } from './classification-engine';
import { parseQuickInput } from './quick-parser';

const now = '2026-10-15T14:00:00.000+09:00' as Parameters<typeof parseQuickInput>[1];

describe('mixed income and expense language', () => {
  it('requires review when salary is context for food expenditure', () => {
    const result = classifyTransactionText('월급으로 식비 점심 12000원', now);
    expect(result.needsReview).toBe(true);
    expect(result.reviewReasons).toContain('income-expense-context-conflict');
  });

  it('preserves explicit expense priority despite income words', () => {
    const result = classifyTransactionText('월급으로 점심 12000원 지출', now);
    expect(result.transactionType.value).toBe('expense');
    expect(result.needsReview).toBe(false);
  });

  it('continues to accept unambiguous income', () => {
    const result = parseQuickInput('월급 2000000원', now);
    expect(result.transactionType).toBe('income');
    expect(result.classification.needsReview).toBe(false);
  });

  it('refuses unresolved classification without storing a transaction', async () => {
    const runtime = await BrowserRuntime.open({
      dbName: `mixed-type-${crypto.randomUUID()}`,
      argon2Profile: 'test',
    });
    try {
      await runtime.createProfile({ nickname: '테스트', pin: '4829517304' });
      const preview = runtime.previewQuickTransaction('월급으로 점심 12000원');
      expect(preview.needsReview).toBe(true);
      await expect(runtime.submitTransaction({
        mode: 'quick', text: '월급으로 점심 12000원',
      })).rejects.toThrow('requires review');
      expect(runtime.getSnapshot().calendar.transactions).toHaveLength(0);
    } finally {
      runtime.close();
    }
  });
});

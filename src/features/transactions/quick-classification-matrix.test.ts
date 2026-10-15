import { describe, expect, it } from 'vitest';
import { parseQuickInput } from './quick-parser';

const now = '2026-10-15T14:00:00.000+09:00' as Parameters<typeof parseQuickInput>[1];

describe('natural language transaction classification matrix', () => {
  it.each(['월급', '부수입', '용돈', '마일리지', '포인트', '리워드', '급여', '캐시백', '환급', '보너스'])(
    'recognizes %s as income with amount',
    (keyword) => {
      const value = parseQuickInput(`${keyword} 10000원`, now);
      expect(value.transactionType).toBe('income');
      expect(value.amountMinor).toBe(10000);
      expect(value.unresolved).toEqual([]);
    },
  );

  it.each(['포인트 사용', '마일리지 차감', '리워드 결제', '대출이자 납부'])(
    'does not mistake %s for income',
    (phrase) => {
      expect(parseQuickInput(`${phrase} 3000원`, now).transactionType).toBe('expense');
    },
  );

  it.each(['아침', '점심', '저녁', '밥', '식사', '외식', '간식', '커피', '음료', '디저트', '주스', '도시락'])(
    'recognizes %s as food variable expense',
    (keyword) => {
      const value = parseQuickInput(`${keyword} 4500원`, now);
      expect(value.transactionType).toBe('expense');
      expect(value.categoryId).toBe('food');
      expect(value.fixedVariable).toBe('variable');
    },
  );

  it.each([
    ['어제', '2026-10-14'],
    ['그제', '2026-10-13'],
    ['그저께', '2026-10-13'],
    ['3일 전', '2026-10-12'],
    ['3일전', '2026-10-12'],
    ['30일 전', '2026-09-15'],
  ])('parses %s as %s in Korean calendar time', (phrase, expected) => {
    const value = parseQuickInput(`${phrase} 점심 7500원`, now);
    expect(value.occurredAt.slice(0, 10)).toBe(expected);
    expect(value.amountMinor).toBe(7500);
    expect(value.categoryId).toBe('food');
  });

  it('flags conflicting dates for review instead of silently guessing', () => {
    const value = parseQuickInput('어제 그제 점심 7500원', now);
    expect(value.classification.needsReview).toBe(true);
    expect(value.classification.reviewReasons).toContain('date-conflict');
  });
});

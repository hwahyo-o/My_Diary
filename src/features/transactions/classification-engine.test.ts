import { describe, expect, it } from 'vitest';
import { parseISODateTime } from '../../domain/shared/types';
import {
  classifyTransactionText,
  DEFAULT_CLASSIFICATION_RULES,
  type ClassificationRuleSet,
} from './classification-engine';

const now = parseISODateTime('2026-10-14T00:32:00.000Z');

describe('transaction classification engine foundation', () => {
  it('returns four independent axes with conservative defaults', () => {
    const result = classifyTransactionText('알 수 없는 거래 5000', now);

    expect(result.transactionType).toMatchObject({
      value: 'expense',
      source: 'default',
      confidence: 'low',
    });
    expect(result.categoryId).toMatchObject({
      value: 'uncategorized',
      source: 'default',
      confidence: 'low',
    });
    expect(result.fixedVariable.value).toBe('variable');
    expect(result.occurredAt.value).toBe(now);
    expect(result.needsReview).toBe(false);
  });

  it('classifies explicit income without requiring runtime type overrides', () => {
    const result = classifyTransactionText('수입 50000', now);

    expect(result.transactionType).toMatchObject({
      value: 'income',
      source: 'explicit',
      confidence: 'high',
    });
  });

  it('keeps legacy food/transport/date rules compatible', () => {
    const food = classifyTransactionText('어제 점심 13000', now);
    expect(food.categoryId.value).toBe('food');
    expect(food.fixedVariable.value).toBe('variable');
    expect(food.occurredAt.value.startsWith('2026-10-13')).toBe(true);

    const transport = classifyTransactionText('버스 1500', now);
    expect(transport.categoryId.value).toBe('transport');
  });

  it('applies explicit > user-rule > keyword > default precedence', () => {
    const rules: ClassificationRuleSet = {
      ...DEFAULT_CLASSIFICATION_RULES,
      typeKeywords: [
        { keyword: '자동수입', type: 'income', source: 'user-rule' },
        { keyword: '지출', type: 'expense', source: 'explicit' },
      ],
      categoryKeywords: [
        { keyword: '카페', categoryId: 'food', source: 'keyword' },
        { keyword: '카페', categoryId: 'leisure-relationships', source: 'user-rule' },
      ],
      fixedVariableByCategory: [
        { categoryId: 'leisure-relationships', value: 'fixed', source: 'user-rule' },
      ],
    };

    const result = classifyTransactionText('자동수입 지출 카페 10000', now, rules);
    expect(result.transactionType).toMatchObject({ value: 'expense', source: 'explicit' });
    expect(result.categoryId).toMatchObject({ value: 'leisure-relationships', source: 'user-rule' });
    expect(result.fixedVariable).toMatchObject({ value: 'fixed', source: 'user-rule' });
  });

  it('fails closed for conflicting rules at the same priority', () => {
    const rules: ClassificationRuleSet = {
      typeKeywords: [
        { keyword: '충돌', type: 'income', source: 'user-rule' },
        { keyword: '충돌', type: 'expense', source: 'user-rule' },
      ],
      categoryKeywords: [
        { keyword: '겹침', categoryId: 'food', source: 'keyword' },
        { keyword: '겹침', categoryId: 'transport', source: 'keyword' },
      ],
      fixedVariableByCategory: [],
    };

    const result = classifyTransactionText('충돌 겹침 5000', now, rules);
    expect(result.needsReview).toBe(true);
    expect(result.reviewReasons).toEqual(
      expect.arrayContaining(['transaction-type-conflict', 'category-conflict']),
    );
  });
});

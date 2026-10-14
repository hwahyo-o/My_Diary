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

  it('classifies the requested income keywords as income', () => {
    for (const keyword of ['월급', '급여', '부수입', '용돈', '마일리지', '포인트', '리워드', '캐시백', '환급', '상여금', '보너스', '이자']) {
      const result = classifyTransactionText(`${keyword} 50000`, now);
      expect(result.transactionType.value, keyword).toBe('income');
      expect(result.transactionType.source, keyword).toBe('keyword');
    }
  });

  it('does not misclassify point or mileage spending phrases as income', () => {
    for (const text of [
      '포인트 사용 3000',
      '포인트 차감 3000',
      '포인트 결제 3000',
      '마일리지 사용 5000',
      '마일리지 차감 5000',
      '리워드 사용 2000',
      '리워드 결제 2000',
      '대출이자 12000',
      '이자 납부 12000',
    ]) {
      expect(classifyTransactionText(text, now).transactionType.value, text).toBe('expense');
    }
  });

  it('lets an explicit type override automatic income keywords', () => {
    expect(classifyTransactionText('지출 월급 10000', now).transactionType).toMatchObject({
      value: 'expense',
      source: 'explicit',
    });
    expect(classifyTransactionText('수입 포인트 사용 3000', now).transactionType).toMatchObject({
      value: 'income',
      source: 'explicit',
    });
  });

  it('parses 그제, 그저께, and n일 전 as relative dates', () => {
    const base = parseISODateTime('2026-03-01T00:30:00+09:00');

    expect(classifyTransactionText('그제 커피 4500', base).occurredAt).toMatchObject({
      value: expect.stringContaining('2026-02-27'),
      confidence: 'high',
    });
    expect(classifyTransactionText('그저께 점심 8000', base).occurredAt.value).toContain('2026-02-27');
    expect(classifyTransactionText('3일 전 교통 1500', base).occurredAt.value).toContain('2026-02-26');
    expect(classifyTransactionText('7일전 식사 9000', base).occurredAt.value).toContain('2026-02-22');
  });

  it('fails closed when different relative dates appear together', () => {
    const result = classifyTransactionText('어제 3일 전 커피 4500', now);
    expect(result.needsReview).toBe(true);
    expect(result.reviewReasons).toContain('date-conflict');
  });

  it('treats 그제 and 그저께 as the same date rather than a conflict', () => {
    const result = classifyTransactionText('그제 그저께 커피 4500', now);
    expect(result.needsReview).toBe(false);
    expect(result.occurredAt.value).toContain('2026-10-12');
  });

  it('classifies expanded food keywords as food and variable', () => {
    for (const keyword of ['아침', '점심', '저녁', '밥', '식사', '외식', '간식', '커피', '음료', '디저트', '주스', '도시락']) {
      const result = classifyTransactionText(`${keyword} 5000`, now);
      expect(result.categoryId.value, keyword).toBe('food');
      expect(result.fixedVariable.value, keyword).toBe('variable');
    }
  });

  it('classifies 대중교통 and related transport words as transport', () => {
    for (const keyword of ['대중교통', '택시', '버스', '지하철', '기차', '주차', '주유']) {
      const result = classifyTransactionText(`${keyword} 5000`, now);
      expect(result.categoryId.value, keyword).toBe('transport');
      expect(result.fixedVariable.value, keyword).toBe('variable');
    }
  });

  it('classifies the expanded expense categories with stable ids', () => {
    const cases = [
      ['월세', 'housing'],
      ['생활용품', 'household'],
      ['통신비', 'telecom'],
      ['넷플릭스 구독', 'subscription'],
      ['병원', 'health-beauty'],
      ['영화', 'leisure-relationships'],
      ['적금', 'saving'],
      ['주식 투자', 'investment'],
      ['대출 상환', 'debt-repayment'],
    ] as const;

    for (const [text, categoryId] of cases) {
      expect(classifyTransactionText(`${text} 10000`, now).categoryId.value, text).toBe(categoryId);
    }
  });

  it('automatically distinguishes common fixed and variable spending', () => {
    expect(classifyTransactionText('월세 600000', now).fixedVariable.value).toBe('fixed');
    expect(classifyTransactionText('통신비 70000', now).fixedVariable.value).toBe('fixed');
    expect(classifyTransactionText('정기결제 17000', now).fixedVariable.value).toBe('fixed');
    expect(classifyTransactionText('커피 4500', now).fixedVariable.value).toBe('variable');
    expect(classifyTransactionText('전기 35000', now).fixedVariable.value).toBe('variable');
    expect(classifyTransactionText('병원 25000', now).fixedVariable.value).toBe('variable');
  });

  it('fails closed when fixed and variable rules conflict at the same priority', () => {
    const result = classifyTransactionText('월세 전기 650000', now);
    expect(result.categoryId.value).toBe('housing');
    expect(result.fixedVariable.value).toBe('mixed');
    expect(result.needsReview).toBe(true);
    expect(result.reviewReasons).toContain('fixed-variable-conflict');
  });

  it('matches short ambiguous keywords as whole tokens only', () => {
    expect(classifyTransactionText('약 5000', now).categoryId.value).toBe('health-beauty');
    expect(classifyTransactionText('예약 5000', now).categoryId.value).toBe('uncategorized');
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

import { parseISODateTime, type ISODateTime } from '../../domain/shared/types';
import type { FixedVariable, TransactionType } from '../../domain/transactions/types';
import { getBuiltinCategory } from './category-catalog';

export type ClassificationSource = 'explicit' | 'user-rule' | 'keyword' | 'default';
export type ClassificationConfidence = 'high' | 'medium' | 'low';

export interface ClassificationDecision<T> {
  readonly value: T;
  readonly source: ClassificationSource;
  readonly confidence: ClassificationConfidence;
  readonly matchedKeywords: readonly string[];
}

export interface TransactionClassification {
  readonly transactionType: ClassificationDecision<TransactionType>;
  readonly categoryId: ClassificationDecision<string>;
  readonly fixedVariable: ClassificationDecision<FixedVariable>;
  readonly occurredAt: ClassificationDecision<ISODateTime>;
  readonly needsReview: boolean;
  readonly reviewReasons: readonly string[];
}

export interface TypeKeywordRule {
  readonly keyword: string;
  readonly type: TransactionType;
  readonly source?: Exclude<ClassificationSource, 'default'>;
}

export interface CategoryKeywordRule {
  readonly keyword: string;
  readonly categoryId: string;
  readonly source?: Exclude<ClassificationSource, 'default'>;
}

export interface FixedVariableRule {
  readonly categoryId: string;
  readonly value: FixedVariable;
  readonly source?: Exclude<ClassificationSource, 'default'>;
}

export interface ClassificationRuleSet {
  readonly typeKeywords: readonly TypeKeywordRule[];
  readonly categoryKeywords: readonly CategoryKeywordRule[];
  readonly fixedVariableByCategory: readonly FixedVariableRule[];
}

export const DEFAULT_CLASSIFICATION_RULES: ClassificationRuleSet = {
  typeKeywords: [
    { keyword: '수입', type: 'income', source: 'explicit' },
    { keyword: '지출', type: 'expense', source: 'explicit' },
  ],
  categoryKeywords: [
    { keyword: '점심', categoryId: 'food' },
    { keyword: '식사', categoryId: 'food' },
    { keyword: '택시', categoryId: 'transport' },
    { keyword: '버스', categoryId: 'transport' },
    { keyword: '지하철', categoryId: 'transport' },
  ],
  fixedVariableByCategory: [],
};

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
}

function containsKeyword(text: string, keyword: string): boolean {
  return text.includes(normalizeText(keyword));
}

function minusCalendarDays(now: ISODateTime, days: number): ISODateTime {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return parseISODateTime(date.toISOString());
}

function resolveTransactionType(
  normalizedText: string,
  rules: ClassificationRuleSet,
  reviewReasons: string[],
): ClassificationDecision<TransactionType> {
  const matches = rules.typeKeywords.filter((rule) => containsKeyword(normalizedText, rule.keyword));
  const uniqueTypes = [...new Set(matches.map((rule) => rule.type))];

  if (uniqueTypes.length > 1) {
    reviewReasons.push('transaction-type-conflict');
    return {
      value: 'expense',
      source: 'default',
      confidence: 'low',
      matchedKeywords: matches.map((rule) => rule.keyword),
    };
  }
  if (matches[0]) {
    return {
      value: matches[0].type,
      source: matches[0].source ?? 'keyword',
      confidence: matches[0].source === 'explicit' ? 'high' : 'medium',
      matchedKeywords: matches.map((rule) => rule.keyword),
    };
  }
  return {
    value: 'expense',
    source: 'default',
    confidence: 'low',
    matchedKeywords: [],
  };
}

function resolveCategory(
  normalizedText: string,
  rules: ClassificationRuleSet,
  reviewReasons: string[],
): ClassificationDecision<string> {
  const matches = rules.categoryKeywords.filter((rule) => containsKeyword(normalizedText, rule.keyword));
  const categoryIds = [...new Set(matches.map((rule) => rule.categoryId))];

  if (categoryIds.length > 1) {
    reviewReasons.push('category-conflict');
    return {
      value: 'uncategorized',
      source: 'default',
      confidence: 'low',
      matchedKeywords: matches.map((rule) => rule.keyword),
    };
  }
  if (matches[0]) {
    return {
      value: matches[0].categoryId,
      source: matches[0].source ?? 'keyword',
      confidence: matches[0].source === 'user-rule' ? 'high' : 'medium',
      matchedKeywords: matches.map((rule) => rule.keyword),
    };
  }
  return {
    value: 'uncategorized',
    source: 'default',
    confidence: 'low',
    matchedKeywords: [],
  };
}

function resolveFixedVariable(
  categoryId: string,
  rules: ClassificationRuleSet,
): ClassificationDecision<FixedVariable> {
  const explicitRule = rules.fixedVariableByCategory.find((rule) => rule.categoryId === categoryId);
  if (explicitRule) {
    return {
      value: explicitRule.value,
      source: explicitRule.source ?? 'user-rule',
      confidence: explicitRule.source === 'user-rule' ? 'high' : 'medium',
      matchedKeywords: [],
    };
  }

  const category = getBuiltinCategory(categoryId);
  if (category) {
    return {
      value: category.defaultFixedVariable,
      source: categoryId === 'uncategorized' ? 'default' : 'keyword',
      confidence: categoryId === 'uncategorized' ? 'low' : 'medium',
      matchedKeywords: [],
    };
  }

  return {
    value: 'variable',
    source: 'default',
    confidence: 'low',
    matchedKeywords: [],
  };
}

function resolveDate(
  normalizedText: string,
  now: ISODateTime,
  reviewReasons: string[],
): ClassificationDecision<ISODateTime> {
  const hasToday = containsKeyword(normalizedText, '오늘');
  const hasYesterday = containsKeyword(normalizedText, '어제');

  if (hasToday && hasYesterday) {
    reviewReasons.push('date-conflict');
    return {
      value: now,
      source: 'default',
      confidence: 'low',
      matchedKeywords: ['오늘', '어제'],
    };
  }
  if (hasYesterday) {
    return {
      value: minusCalendarDays(now, 1),
      source: 'keyword',
      confidence: 'high',
      matchedKeywords: ['어제'],
    };
  }
  if (hasToday) {
    return {
      value: now,
      source: 'explicit',
      confidence: 'high',
      matchedKeywords: ['오늘'],
    };
  }
  return {
    value: now,
    source: 'default',
    confidence: 'low',
    matchedKeywords: [],
  };
}

export function classifyTransactionText(
  rawText: string,
  now: ISODateTime,
  rules: ClassificationRuleSet = DEFAULT_CLASSIFICATION_RULES,
): TransactionClassification {
  const normalizedText = normalizeText(rawText);
  const reviewReasons: string[] = [];
  const transactionType = resolveTransactionType(normalizedText, rules, reviewReasons);
  const categoryId = resolveCategory(normalizedText, rules, reviewReasons);
  const fixedVariable = resolveFixedVariable(categoryId.value, rules);
  const occurredAt = resolveDate(normalizedText, now, reviewReasons);

  return {
    transactionType,
    categoryId,
    fixedVariable,
    occurredAt,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

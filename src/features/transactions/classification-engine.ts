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
  readonly excludeWhen?: readonly string[];
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

export const DEFAULT_INCOME_KEYWORDS = [
  '월급',
  '급여',
  '부수입',
  '용돈',
  '마일리지',
  '포인트',
  '리워드',
  '캐시백',
  '환급',
  '상여금',
  '보너스',
  '이자',
] as const;

const DEFAULT_INCOME_EXCLUSIONS: Readonly<Record<string, readonly string[]>> = {
  마일리지: ['마일리지 사용', '마일리지 차감', '마일리지 결제'],
  포인트: ['포인트 사용', '포인트 차감', '포인트 결제'],
  리워드: ['리워드 사용', '리워드 차감', '리워드 결제'],
  이자: ['대출이자', '대출 이자', '이자 납부', '이자 지출'],
};

export const DEFAULT_CLASSIFICATION_RULES: ClassificationRuleSet = {
  typeKeywords: [
    { keyword: '수입', type: 'income', source: 'explicit' },
    { keyword: '지출', type: 'expense', source: 'explicit' },
    ...DEFAULT_INCOME_KEYWORDS.map((keyword) => ({
      keyword,
      type: 'income' as const,
      source: 'keyword' as const,
      ...(DEFAULT_INCOME_EXCLUSIONS[keyword]
        ? { excludeWhen: DEFAULT_INCOME_EXCLUSIONS[keyword] }
        : {}),
    })),
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

function containsExplicitToken(text: string, keyword: string): boolean {
  const target = normalizeText(keyword);
  return text
    .split(/[\s,.:;!?()[\]{}]+/u)
    .filter(Boolean)
    .includes(target);
}

function matchesTypeRule(text: string, rule: TypeKeywordRule): boolean {
  return rule.source === 'explicit'
    ? containsExplicitToken(text, rule.keyword)
    : containsKeyword(text, rule.keyword);
}

function minusCalendarDays(now: ISODateTime, days: number): ISODateTime {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return parseISODateTime(date.toISOString());
}

function sourceRank(source: ClassificationSource): number {
  switch (source) {
    case 'explicit':
      return 4;
    case 'user-rule':
      return 3;
    case 'keyword':
      return 2;
    case 'default':
      return 1;
  }
}

function resolveTransactionType(
  normalizedText: string,
  rules: ClassificationRuleSet,
  reviewReasons: string[],
): ClassificationDecision<TransactionType> {
  const matches = rules.typeKeywords
    .filter((rule) => matchesTypeRule(normalizedText, rule))
    .filter((rule) => !(rule.excludeWhen ?? []).some((phrase) => containsKeyword(normalizedText, phrase)))
    .map((rule) => ({ ...rule, resolvedSource: rule.source ?? 'keyword' as ClassificationSource }));
  const highestRank = matches.reduce((rank, rule) => Math.max(rank, sourceRank(rule.resolvedSource)), 0);
  const topMatches = matches.filter((rule) => sourceRank(rule.resolvedSource) === highestRank);
  const uniqueTypes = [...new Set(topMatches.map((rule) => rule.type))];

  if (uniqueTypes.length > 1) {
    reviewReasons.push('transaction-type-conflict');
    return {
      value: 'expense',
      source: 'default',
      confidence: 'low',
      matchedKeywords: topMatches.map((rule) => rule.keyword),
    };
  }
  if (topMatches[0]) {
    return {
      value: topMatches[0].type,
      source: topMatches[0].resolvedSource,
      confidence: topMatches[0].resolvedSource === 'explicit' || topMatches[0].resolvedSource === 'user-rule' ? 'high' : 'medium',
      matchedKeywords: topMatches.map((rule) => rule.keyword),
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
  const matches = rules.categoryKeywords
    .filter((rule) => containsKeyword(normalizedText, rule.keyword))
    .map((rule) => ({ ...rule, resolvedSource: rule.source ?? 'keyword' as ClassificationSource }));
  const highestRank = matches.reduce((rank, rule) => Math.max(rank, sourceRank(rule.resolvedSource)), 0);
  const topMatches = matches.filter((rule) => sourceRank(rule.resolvedSource) === highestRank);
  const categoryIds = [...new Set(topMatches.map((rule) => rule.categoryId))];

  if (categoryIds.length > 1) {
    reviewReasons.push('category-conflict');
    return {
      value: 'uncategorized',
      source: 'default',
      confidence: 'low',
      matchedKeywords: topMatches.map((rule) => rule.keyword),
    };
  }
  if (topMatches[0]) {
    return {
      value: topMatches[0].categoryId,
      source: topMatches[0].resolvedSource,
      confidence: topMatches[0].resolvedSource === 'user-rule' ? 'high' : 'medium',
      matchedKeywords: topMatches.map((rule) => rule.keyword),
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

interface RelativeDateMatch {
  readonly daysAgo: number;
  readonly label: string;
  readonly source: ClassificationSource;
}

function findRelativeDateMatches(normalizedText: string): RelativeDateMatch[] {
  const matches: RelativeDateMatch[] = [];

  if (containsExplicitToken(normalizedText, '오늘')) {
    matches.push({ daysAgo: 0, label: '오늘', source: 'explicit' });
  }
  if (containsExplicitToken(normalizedText, '어제')) {
    matches.push({ daysAgo: 1, label: '어제', source: 'keyword' });
  }
  if (containsExplicitToken(normalizedText, '그제')) {
    matches.push({ daysAgo: 2, label: '그제', source: 'keyword' });
  }
  if (containsExplicitToken(normalizedText, '그저께')) {
    matches.push({ daysAgo: 2, label: '그저께', source: 'keyword' });
  }

  const relativePattern = /(?:^|\s)(\d{1,4})\s*일\s*전(?=\s|$|[,.:;!?])/gu;
  for (const match of normalizedText.matchAll(relativePattern)) {
    const rawDays = match[1];
    if (!rawDays) continue;
    const daysAgo = Number(rawDays);
    if (!Number.isSafeInteger(daysAgo) || daysAgo < 1 || daysAgo > 3650) continue;
    matches.push({
      daysAgo,
      label: `${daysAgo}일 전`,
      source: 'keyword',
    });
  }

  return matches;
}

function resolveDate(
  normalizedText: string,
  now: ISODateTime,
  reviewReasons: string[],
): ClassificationDecision<ISODateTime> {
  const matches = findRelativeDateMatches(normalizedText);
  const uniqueOffsets = [...new Set(matches.map((match) => match.daysAgo))];

  if (uniqueOffsets.length > 1) {
    reviewReasons.push('date-conflict');
    return {
      value: now,
      source: 'default',
      confidence: 'low',
      matchedKeywords: matches.map((match) => match.label),
    };
  }

  const selected = matches[0];
  if (!selected) {
    return {
      value: now,
      source: 'default',
      confidence: 'low',
      matchedKeywords: [],
    };
  }

  return {
    value: selected.daysAgo === 0 ? now : minusCalendarDays(now, selected.daysAgo),
    source: selected.source,
    confidence: 'high',
    matchedKeywords: matches.map((match) => match.label),
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

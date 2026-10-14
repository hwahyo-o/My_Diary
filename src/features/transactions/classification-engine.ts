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

export interface FixedVariableKeywordRule {
  readonly keyword: string;
  readonly value: FixedVariable;
  readonly source?: Exclude<ClassificationSource, 'default'>;
}

export interface ClassificationRuleSet {
  readonly typeKeywords: readonly TypeKeywordRule[];
  readonly categoryKeywords: readonly CategoryKeywordRule[];
  readonly fixedVariableKeywords?: readonly FixedVariableKeywordRule[];
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
    ...['아침', '점심', '저녁', '밥', '식사', '외식', '간식', '커피', '음료', '디저트', '주스', '도시락', '카페', '빵', '베이커리', '배달', '야식', '브런치']
      .map((keyword) => ({ keyword, categoryId: 'food' as const })),
    ...['교통', '대중교통', '택시', '버스', '지하철', '기차', 'ktx', '주차', '톨게이트', '주유']
      .map((keyword) => ({ keyword, categoryId: 'transport' as const })),
    ...['월세', '전세', '관리비', '수도', '전기', '가스', '공과금']
      .map((keyword) => ({ keyword, categoryId: 'housing' as const })),
    ...['생필품', '생활용품', '세제', '휴지', '청소용품']
      .map((keyword) => ({ keyword, categoryId: 'household' as const })),
    ...['통신비', '휴대폰', '핸드폰', '인터넷', '데이터']
      .map((keyword) => ({ keyword, categoryId: 'telecom' as const })),
    ...['구독', '멤버십', '정기결제']
      .map((keyword) => ({ keyword, categoryId: 'subscription' as const })),
    ...['병원', '약국', '약', '진료', '미용실', '화장품']
      .map((keyword) => ({ keyword, categoryId: 'health-beauty' as const })),
    ...['영화', '공연', '전시', '취미', '선물', '데이트', '모임']
      .map((keyword) => ({ keyword, categoryId: 'leisure-relationships' as const })),
    ...['적금', '예금', '저축']
      .map((keyword) => ({ keyword, categoryId: 'saving' as const })),
    ...['주식', 'etf', '펀드', '투자', '매수']
      .map((keyword) => ({ keyword, categoryId: 'investment' as const })),
    ...['대출상환', '대출 상환', '원금상환', '카드대금', '대출']
      .map((keyword) => ({ keyword, categoryId: 'debt-repayment' as const })),
  ],
  fixedVariableKeywords: [
    ...['월세', '통신비', '휴대폰', '핸드폰', '인터넷', '구독', '멤버십', '정기결제', '적금', '예금', '저축', '대출상환', '대출 상환', '원금상환', '카드대금']
      .map((keyword) => ({ keyword, value: 'fixed' as const })),
    ...['아침', '점심', '저녁', '밥', '식사', '외식', '간식', '커피', '음료', '디저트', '주스', '도시락', '카페', '빵', '베이커리', '배달', '야식', '브런치',
      '교통', '대중교통', '택시', '버스', '지하철', '기차', 'ktx', '주차', '톨게이트', '주유',
      '수도', '전기', '가스', '공과금', '생필품', '생활용품', '세제', '휴지', '청소용품',
      '병원', '약국', '약', '진료', '미용실', '화장품', '영화', '공연', '전시', '취미', '선물', '데이트', '모임']
      .map((keyword) => ({ keyword, value: 'variable' as const })),
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

function offsetMinutesFromIso(value: ISODateTime): number {
  if (value.endsWith('Z')) return 0;
  const match = value.match(/([+-])(\d{2}):(\d{2})$/u);
  if (!match) return 0;
  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === '-' ? -total : total;
}

function formatWithOffset(instantMs: number, offsetMinutes: number): ISODateTime {
  const shifted = new Date(instantMs + offsetMinutes * 60_000);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainder = absoluteOffset % 60;
  const suffix = offsetMinutes === 0
    ? 'Z'
    : `${sign}${pad(offsetHours)}:${pad(offsetRemainder)}`;

  return parseISODateTime(
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
    + `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
    + `.${pad(shifted.getUTCMilliseconds(), 3)}${suffix}`,
  );
}

function minusCalendarDays(now: ISODateTime, days: number): ISODateTime {
  const offsetMinutes = offsetMinutesFromIso(now);
  const localInstant = Date.parse(now) + offsetMinutes * 60_000;
  const localDate = new Date(localInstant);
  localDate.setUTCDate(localDate.getUTCDate() - days);
  const shiftedInstant = localDate.getTime() - offsetMinutes * 60_000;
  return formatWithOffset(shiftedInstant, offsetMinutes);
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
  normalizedText: string,
  categoryId: string,
  rules: ClassificationRuleSet,
  reviewReasons: string[],
): ClassificationDecision<FixedVariable> {
  const keywordMatches = (rules.fixedVariableKeywords ?? [])
    .filter((rule) => containsKeyword(normalizedText, rule.keyword))
    .map((rule) => ({ ...rule, resolvedSource: rule.source ?? 'keyword' as ClassificationSource }));
  const highestRank = keywordMatches.reduce(
    (rank, rule) => Math.max(rank, sourceRank(rule.resolvedSource)),
    0,
  );
  const topKeywordMatches = keywordMatches.filter(
    (rule) => sourceRank(rule.resolvedSource) === highestRank,
  );
  const keywordValues = [...new Set(topKeywordMatches.map((rule) => rule.value))];

  if (keywordValues.length > 1) {
    reviewReasons.push('fixed-variable-conflict');
    return {
      value: 'mixed',
      source: 'default',
      confidence: 'low',
      matchedKeywords: topKeywordMatches.map((rule) => rule.keyword),
    };
  }
  if (topKeywordMatches[0]) {
    return {
      value: topKeywordMatches[0].value,
      source: topKeywordMatches[0].resolvedSource,
      confidence: topKeywordMatches[0].resolvedSource === 'user-rule' ? 'high' : 'medium',
      matchedKeywords: topKeywordMatches.map((rule) => rule.keyword),
    };
  }

  const categoryRule = rules.fixedVariableByCategory.find((rule) => rule.categoryId === categoryId);
  if (categoryRule) {
    return {
      value: categoryRule.value,
      source: categoryRule.source ?? 'user-rule',
      confidence: categoryRule.source === 'user-rule' ? 'high' : 'medium',
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
  const fixedVariable = resolveFixedVariable(normalizedText, categoryId.value, rules, reviewReasons);
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

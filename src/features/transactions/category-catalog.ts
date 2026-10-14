import type { FixedVariable } from '../../domain/transactions/types';

export const BUILTIN_CATEGORY_IDS = [
  'uncategorized',
  'food',
  'transport',
  'housing',
  'household',
  'telecom',
  'subscription',
  'health-beauty',
  'leisure-relationships',
  'saving',
  'investment',
  'debt-repayment',
] as const;

export type BuiltinCategoryId = typeof BUILTIN_CATEGORY_IDS[number];

export interface BuiltinCategoryDefinition {
  readonly id: BuiltinCategoryId;
  readonly label: string;
  readonly defaultFixedVariable: FixedVariable;
}

export const BUILTIN_CATEGORIES: readonly BuiltinCategoryDefinition[] = [
  { id: 'uncategorized', label: '미분류', defaultFixedVariable: 'variable' },
  { id: 'food', label: '식비', defaultFixedVariable: 'variable' },
  { id: 'transport', label: '교통', defaultFixedVariable: 'variable' },
  { id: 'housing', label: '주거', defaultFixedVariable: 'mixed' },
  { id: 'household', label: '생활용품', defaultFixedVariable: 'variable' },
  { id: 'telecom', label: '통신', defaultFixedVariable: 'fixed' },
  { id: 'subscription', label: '구독', defaultFixedVariable: 'fixed' },
  { id: 'health-beauty', label: '건강/미용', defaultFixedVariable: 'variable' },
  { id: 'leisure-relationships', label: '여가/관계', defaultFixedVariable: 'variable' },
  { id: 'saving', label: '저축', defaultFixedVariable: 'fixed' },
  { id: 'investment', label: '투자', defaultFixedVariable: 'mixed' },
  { id: 'debt-repayment', label: '부채 상환', defaultFixedVariable: 'fixed' },
] as const;

export function getBuiltinCategory(id: string): BuiltinCategoryDefinition | undefined {
  return BUILTIN_CATEGORIES.find((category) => category.id === id);
}

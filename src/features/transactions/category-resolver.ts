export type CategoryRuleKind = 'user' | 'recurring' | 'merchant' | 'keyword';

export interface CategoryRule {
  readonly kind: CategoryRuleKind;
  readonly match: string;
  readonly categoryId: string;
}

export interface CategoryContext {
  readonly merchant?: string;
  readonly memo?: string;
  readonly recurringKey?: string;
}

export interface CategoryCandidate {
  readonly categoryId: string;
  readonly source: CategoryRuleKind | 'fallback';
  readonly confidence: 'high' | 'medium' | 'low';
}

const priority: CategoryRuleKind[] = ['user', 'recurring', 'merchant', 'keyword'];

function matches(rule: CategoryRule, context: CategoryContext): boolean {
  switch (rule.kind) {
    case 'user':
    case 'merchant':
      return context.merchant?.trim().toLowerCase() === rule.match.trim().toLowerCase();
    case 'recurring':
      return context.recurringKey === rule.match;
    case 'keyword': {
      const haystack = `${context.merchant ?? ''} ${context.memo ?? ''}`.toLowerCase();
      return haystack.includes(rule.match.toLowerCase());
    }
  }
}

export function resolveCategory(context: CategoryContext, rules: readonly CategoryRule[]): CategoryCandidate {
  for (const kind of priority) {
    const rule = rules.find((candidate) => candidate.kind === kind && matches(candidate, context));
    if (!rule) continue;
    return {
      categoryId: rule.categoryId,
      source: rule.kind,
      confidence: rule.kind === 'user' || rule.kind === 'recurring' ? 'high' : 'medium',
    };
  }

  return { categoryId: 'uncategorized', source: 'fallback', confidence: 'low' };
}

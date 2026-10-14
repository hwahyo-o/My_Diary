import type { FixedVariable } from '../../domain/transactions/types';
import { BUILTIN_CATEGORIES, type BuiltinCategoryId } from './category-catalog';
import {
  DEFAULT_CLASSIFICATION_RULES,
  type ClassificationRuleSet,
  type FixedVariableRule,
} from './classification-engine';

export type FixedVariableMode = 'auto' | 'fixed' | 'variable';

export interface ClassificationSettings {
  readonly fixedVariableByCategory: Readonly<Partial<Record<BuiltinCategoryId, FixedVariableMode>>>;
}

export interface ClassificationSettingsViewModel {
  readonly categories: readonly {
    readonly id: BuiltinCategoryId;
    readonly label: string;
    readonly defaultFixedVariable: FixedVariable;
    readonly mode: FixedVariableMode;
  }[];
}

export const DEFAULT_CLASSIFICATION_SETTINGS: ClassificationSettings = {
  fixedVariableByCategory: {},
};

export function normalizeClassificationSettings(input: ClassificationSettings): ClassificationSettings {
  const normalized: Partial<Record<BuiltinCategoryId, FixedVariableMode>> = {};
  for (const category of BUILTIN_CATEGORIES) {
    if (category.id === 'uncategorized') continue;
    const mode = input.fixedVariableByCategory[category.id];
    if (mode === 'fixed' || mode === 'variable') normalized[category.id] = mode;
  }
  return { fixedVariableByCategory: normalized };
}

export function toClassificationSettingsViewModel(
  settings: ClassificationSettings,
): ClassificationSettingsViewModel {
  return {
    categories: BUILTIN_CATEGORIES
      .filter((category) => category.id !== 'uncategorized')
      .map((category) => ({
        id: category.id,
        label: category.label,
        defaultFixedVariable: category.defaultFixedVariable,
        mode: settings.fixedVariableByCategory[category.id] ?? 'auto',
      })),
  };
}

export function rulesWithClassificationSettings(
  settings: ClassificationSettings,
): ClassificationRuleSet {
  const userRules: FixedVariableRule[] = Object.entries(settings.fixedVariableByCategory)
    .flatMap(([categoryId, mode]) => {
      if (mode !== 'fixed' && mode !== 'variable') return [];
      return [{
        categoryId,
        value: mode,
        source: 'user-rule' as const,
      }];
    });

  return {
    ...DEFAULT_CLASSIFICATION_RULES,
    fixedVariableByCategory: [
      ...userRules,
      ...DEFAULT_CLASSIFICATION_RULES.fixedVariableByCategory,
    ],
  };
}

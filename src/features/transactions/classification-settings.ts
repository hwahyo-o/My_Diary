import type { FixedVariable } from '../../domain/transactions/types';
import { sanitizeCorrectionObservations, suggestCorrections, type CorrectionObservation } from './correction-suggestions';
import { BUILTIN_CATEGORIES, type BuiltinCategoryId } from './category-catalog';
import {
  DEFAULT_CLASSIFICATION_RULES,
  DEFAULT_INCOME_KEYWORDS,
  type CategoryKeywordRule,
  type ClassificationRuleSet,
  type FixedVariableRule,
} from './classification-engine';

export type FixedVariableMode = 'auto' | 'fixed' | 'variable';

export interface CustomCategoryKeyword {
  readonly keyword: string;
  readonly categoryId: BuiltinCategoryId;
}

export interface ClassificationSettings {
  readonly fixedVariableByCategory: Readonly<Partial<Record<BuiltinCategoryId, FixedVariableMode>>>;
  readonly customCategoryKeywords?: readonly CustomCategoryKeyword[];
  readonly disabledDefaultCategoryKeywords?: readonly string[];
  readonly customIncomeKeywords?: readonly string[];
  readonly disabledDefaultIncomeKeywords?: readonly string[];
  readonly correctionObservations?: readonly CorrectionObservation[];
}

export interface ClassificationSettingsViewModel {
  readonly incomeKeywords: readonly {
    readonly value: string;
    readonly source: 'default' | 'custom';
  }[];
  readonly hasIncomeKeywordChanges: boolean;
  readonly correctionSuggestions: readonly { readonly keyword: string; readonly categoryId: BuiltinCategoryId; readonly categoryLabel: string; readonly count: number }[];
  readonly categories: readonly {
    readonly id: BuiltinCategoryId;
    readonly label: string;
    readonly defaultFixedVariable: FixedVariable;
    readonly mode: FixedVariableMode;
    readonly keywords: readonly {
      readonly value: string;
      readonly source: 'default' | 'custom';
    }[];
    readonly hasKeywordChanges: boolean;
  }[];
}

export const DEFAULT_CLASSIFICATION_SETTINGS: ClassificationSettings = {
  fixedVariableByCategory: {},
  customCategoryKeywords: [],
  disabledDefaultCategoryKeywords: [],
  customIncomeKeywords: [],
  disabledDefaultIncomeKeywords: [],
  correctionObservations: [],
};

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code < 32 || code === 127)) return true;
  }
  return false;
}

function normalizeKeyword(value: string): string {
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
  if (!normalized) throw new TypeError('Keyword is required.');
  if (normalized.length > 40) throw new TypeError('Keyword is too long.');
  if (hasControlCharacters(normalized)) throw new TypeError('Keyword contains control characters.');
  return normalized.split(/\s+/u).filter(Boolean).join(' ');
}

function disabledKey(categoryId: string, keyword: string): string {
  return `${categoryId}::${normalizeKeyword(keyword)}`;
}

function validCategoryId(value: string): value is BuiltinCategoryId {
  return BUILTIN_CATEGORIES.some((category) => category.id === value && category.id !== 'uncategorized');
}

function defaultCategoryRules(): readonly CategoryKeywordRule[] {
  return DEFAULT_CLASSIFICATION_RULES.categoryKeywords;
}

export function normalizeClassificationSettings(input: ClassificationSettings): ClassificationSettings {
  const fixed: Partial<Record<BuiltinCategoryId, FixedVariableMode>> = {};
  for (const category of BUILTIN_CATEGORIES) {
    if (category.id === 'uncategorized') continue;
    const mode = input.fixedVariableByCategory[category.id];
    if (mode === 'fixed' || mode === 'variable') fixed[category.id] = mode;
  }

  const customMap = new Map<string, CustomCategoryKeyword>();
  for (const rule of input.customCategoryKeywords ?? []) {
    if (!validCategoryId(rule.categoryId)) continue;
    const keyword = normalizeKeyword(rule.keyword);
    customMap.set(`${rule.categoryId}::${keyword}`, { keyword, categoryId: rule.categoryId });
  }

  const validDefaultKeys = new Set(
    defaultCategoryRules().map((rule) => disabledKey(rule.categoryId, rule.keyword)),
  );
  const disabled = [...new Set(input.disabledDefaultCategoryKeywords ?? [])]
    .filter((key) => validDefaultKeys.has(key));

  const defaultIncomeSet = new Set(DEFAULT_INCOME_KEYWORDS.map((keyword) => normalizeKeyword(keyword)));
  const customIncome = [...new Set((input.customIncomeKeywords ?? []).map((keyword) => normalizeKeyword(keyword)))]
    .filter((keyword) => !defaultIncomeSet.has(keyword));
  const disabledIncome = [...new Set((input.disabledDefaultIncomeKeywords ?? []).map((keyword) => normalizeKeyword(keyword)))]
    .filter((keyword) => defaultIncomeSet.has(keyword));

  return {
    fixedVariableByCategory: fixed,
    customCategoryKeywords: [...customMap.values()],
    disabledDefaultCategoryKeywords: disabled,
    customIncomeKeywords: customIncome,
    disabledDefaultIncomeKeywords: disabledIncome,
    correctionObservations: sanitizeCorrectionObservations(input.correctionObservations ?? []),
  };
}

function activeKeywordAssignments(settings: ClassificationSettings): Map<string, BuiltinCategoryId> {
  const normalized = normalizeClassificationSettings(settings);
  const disabled = new Set(normalized.disabledDefaultCategoryKeywords ?? []);
  const assignments = new Map<string, BuiltinCategoryId>();

  for (const rule of defaultCategoryRules()) {
    if (!validCategoryId(rule.categoryId)) continue;
    if (disabled.has(disabledKey(rule.categoryId, rule.keyword))) continue;
    assignments.set(normalizeKeyword(rule.keyword), rule.categoryId);
  }
  for (const rule of normalized.customCategoryKeywords ?? []) {
    assignments.set(normalizeKeyword(rule.keyword), rule.categoryId);
  }
  return assignments;
}

export function addCategoryKeyword(
  settings: ClassificationSettings,
  categoryId: string,
  rawKeyword: string,
): ClassificationSettings {
  if (!validCategoryId(categoryId)) throw new TypeError('Unknown classification category.');
  const keyword = normalizeKeyword(rawKeyword);
  const normalized = normalizeClassificationSettings(settings);
  const assignments = activeKeywordAssignments(normalized);
  const existingCategory = assignments.get(keyword);
  if (existingCategory && existingCategory !== categoryId) {
    throw new Error('Keyword is already assigned to another category.');
  }
  if (existingCategory === categoryId) return normalized;

  const defaultMatch = defaultCategoryRules().find(
    (rule) => rule.categoryId === categoryId && normalizeKeyword(rule.keyword) === keyword,
  );
  if (defaultMatch) {
    const key = disabledKey(categoryId, keyword);
    return normalizeClassificationSettings({
      ...normalized,
      disabledDefaultCategoryKeywords: (normalized.disabledDefaultCategoryKeywords ?? [])
        .filter((item) => item !== key),
    });
  }

  return normalizeClassificationSettings({
    ...normalized,
    customCategoryKeywords: [
      ...(normalized.customCategoryKeywords ?? []),
      { keyword, categoryId },
    ],
  });
}

export function removeCategoryKeyword(
  settings: ClassificationSettings,
  categoryId: string,
  rawKeyword: string,
): ClassificationSettings {
  if (!validCategoryId(categoryId)) throw new TypeError('Unknown classification category.');
  const keyword = normalizeKeyword(rawKeyword);
  const normalized = normalizeClassificationSettings(settings);
  const custom = normalized.customCategoryKeywords ?? [];
  const remainingCustom = custom.filter(
    (rule) => !(rule.categoryId === categoryId && normalizeKeyword(rule.keyword) === keyword),
  );
  if (remainingCustom.length !== custom.length) {
    return normalizeClassificationSettings({ ...normalized, customCategoryKeywords: remainingCustom });
  }

  const defaultMatch = defaultCategoryRules().find(
    (rule) => rule.categoryId === categoryId && normalizeKeyword(rule.keyword) === keyword,
  );
  if (!defaultMatch) return normalized;
  const key = disabledKey(categoryId, keyword);
  return normalizeClassificationSettings({
    ...normalized,
    disabledDefaultCategoryKeywords: [
      ...(normalized.disabledDefaultCategoryKeywords ?? []),
      key,
    ],
  });
}

export function restoreCategoryKeywords(
  settings: ClassificationSettings,
  categoryId: string,
): ClassificationSettings {
  if (!validCategoryId(categoryId)) throw new TypeError('Unknown classification category.');
  const normalized = normalizeClassificationSettings(settings);
  return normalizeClassificationSettings({
    ...normalized,
    customCategoryKeywords: (normalized.customCategoryKeywords ?? [])
      .filter((rule) => rule.categoryId !== categoryId),
    disabledDefaultCategoryKeywords: (normalized.disabledDefaultCategoryKeywords ?? [])
      .filter((key) => !key.startsWith(`${categoryId}::`)),
  });
}

export function addIncomeKeyword(
  settings: ClassificationSettings,
  rawKeyword: string,
): ClassificationSettings {
  const keyword = normalizeKeyword(rawKeyword);
  if (keyword === '수입' || keyword === '지출') {
    throw new Error('Keyword is reserved for explicit transaction type input.');
  }

  const normalized = normalizeClassificationSettings(settings);
  const defaultIncomeSet = new Set(DEFAULT_INCOME_KEYWORDS.map((item) => normalizeKeyword(item)));
  if (defaultIncomeSet.has(keyword)) {
    return normalizeClassificationSettings({
      ...normalized,
      disabledDefaultIncomeKeywords: (normalized.disabledDefaultIncomeKeywords ?? [])
        .filter((item) => item !== keyword),
    });
  }

  if ((normalized.customIncomeKeywords ?? []).includes(keyword)) return normalized;
  return normalizeClassificationSettings({
    ...normalized,
    customIncomeKeywords: [...(normalized.customIncomeKeywords ?? []), keyword],
  });
}

export function removeIncomeKeyword(
  settings: ClassificationSettings,
  rawKeyword: string,
): ClassificationSettings {
  const keyword = normalizeKeyword(rawKeyword);
  const normalized = normalizeClassificationSettings(settings);
  const custom = normalized.customIncomeKeywords ?? [];
  if (custom.includes(keyword)) {
    return normalizeClassificationSettings({
      ...normalized,
      customIncomeKeywords: custom.filter((item) => item !== keyword),
    });
  }

  const defaultIncomeSet = new Set(DEFAULT_INCOME_KEYWORDS.map((item) => normalizeKeyword(item)));
  if (!defaultIncomeSet.has(keyword)) return normalized;
  return normalizeClassificationSettings({
    ...normalized,
    disabledDefaultIncomeKeywords: [
      ...(normalized.disabledDefaultIncomeKeywords ?? []),
      keyword,
    ],
  });
}

export function restoreIncomeKeywords(settings: ClassificationSettings): ClassificationSettings {
  const normalized = normalizeClassificationSettings(settings);
  return normalizeClassificationSettings({
    ...normalized,
    customIncomeKeywords: [],
    disabledDefaultIncomeKeywords: [],
  });
}

export function toClassificationSettingsViewModel(
  settings: ClassificationSettings,
): ClassificationSettingsViewModel {
  const normalized = normalizeClassificationSettings(settings);
  const disabled = new Set(normalized.disabledDefaultCategoryKeywords ?? []);
  const disabledIncome = new Set(normalized.disabledDefaultIncomeKeywords ?? []);
  const defaultIncome = DEFAULT_INCOME_KEYWORDS
    .map((keyword) => normalizeKeyword(keyword))
    .filter((keyword) => !disabledIncome.has(keyword))
    .map((value) => ({ value, source: 'default' as const }));
  const customIncome = (normalized.customIncomeKeywords ?? [])
    .map((value) => ({ value, source: 'custom' as const }));

  const assignedKeywords = new Set(activeKeywordAssignments(normalized).keys());
  return {
    incomeKeywords: [...defaultIncome, ...customIncome],
    correctionSuggestions: suggestCorrections(normalized.correctionObservations ?? [], assignedKeywords)
      .map((suggestion) => ({
        ...suggestion,
        categoryLabel: BUILTIN_CATEGORIES.find((category) => category.id === suggestion.categoryId)?.label ?? suggestion.categoryId,
      })),
    hasIncomeKeywordChanges: customIncome.length > 0 || disabledIncome.size > 0,
    categories: BUILTIN_CATEGORIES
      .filter((category) => category.id !== 'uncategorized')
      .map((category) => {
        const defaults = defaultCategoryRules()
          .filter((rule) => rule.categoryId === category.id)
          .filter((rule) => !disabled.has(disabledKey(category.id, rule.keyword)))
          .map((rule) => ({ value: normalizeKeyword(rule.keyword), source: 'default' as const }));
        const custom = (normalized.customCategoryKeywords ?? [])
          .filter((rule) => rule.categoryId === category.id)
          .map((rule) => ({ value: rule.keyword, source: 'custom' as const }));
        const hasDisabledDefaults = (normalized.disabledDefaultCategoryKeywords ?? [])
          .some((key) => key.startsWith(`${category.id}::`));
        return {
          id: category.id,
          label: category.label,
          defaultFixedVariable: category.defaultFixedVariable,
          mode: normalized.fixedVariableByCategory[category.id] ?? 'auto',
          keywords: [...defaults, ...custom],
          hasKeywordChanges: custom.length > 0 || hasDisabledDefaults,
        };
      }),
  };
}

export function rulesWithClassificationSettings(
  settings: ClassificationSettings,
): ClassificationRuleSet {
  const normalized = normalizeClassificationSettings(settings);
  const userFixedRules: FixedVariableRule[] = Object.entries(normalized.fixedVariableByCategory)
    .flatMap(([categoryId, mode]) => {
      if (mode !== 'fixed' && mode !== 'variable') return [];
      return [{
        categoryId,
        value: mode,
        source: 'user-rule' as const,
      }];
    });
  const disabled = new Set(normalized.disabledDefaultCategoryKeywords ?? []);
  const defaultCategoryKeywords = DEFAULT_CLASSIFICATION_RULES.categoryKeywords
    .filter((rule) => !disabled.has(disabledKey(rule.categoryId, rule.keyword)));
  const customCategoryKeywords: CategoryKeywordRule[] = (normalized.customCategoryKeywords ?? [])
    .map((rule) => ({
      keyword: rule.keyword,
      categoryId: rule.categoryId,
      source: 'user-rule' as const,
    }));
  const disabledIncome = new Set(normalized.disabledDefaultIncomeKeywords ?? []);
  const defaultIncomeSet = new Set(DEFAULT_INCOME_KEYWORDS.map((keyword) => normalizeKeyword(keyword)));
  const defaultTypeKeywords = DEFAULT_CLASSIFICATION_RULES.typeKeywords.filter((rule) => {
    const keyword = normalizeKeyword(rule.keyword);
    return !defaultIncomeSet.has(keyword) || !disabledIncome.has(keyword);
  });
  const customIncomeTypeKeywords = (normalized.customIncomeKeywords ?? []).map((keyword) => ({
    keyword,
    type: 'income' as const,
    source: 'user-rule' as const,
  }));

  return {
    ...DEFAULT_CLASSIFICATION_RULES,
    typeKeywords: [
      ...customIncomeTypeKeywords,
      ...defaultTypeKeywords,
    ],
    categoryKeywords: [
      ...customCategoryKeywords,
      ...defaultCategoryKeywords,
    ],
    fixedVariableByCategory: [
      ...userFixedRules,
      ...DEFAULT_CLASSIFICATION_RULES.fixedVariableByCategory,
    ],
  };
}

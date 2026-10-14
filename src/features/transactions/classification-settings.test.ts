import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLASSIFICATION_SETTINGS,
  normalizeClassificationSettings,
  addCategoryKeyword,
  addIncomeKeyword,
  removeCategoryKeyword,
  removeIncomeKeyword,
  restoreCategoryKeywords,
  restoreIncomeKeywords,
  rulesWithClassificationSettings,
  toClassificationSettingsViewModel,
} from './classification-settings';
import { classifyTransactionText } from './classification-engine';
import { parseISODateTime } from '../../domain/shared/types';

const now = parseISODateTime('2026-10-14T10:00:00+09:00');

describe('classification settings', () => {
  it('exposes built-in categories with auto mode by default', () => {
    const view = toClassificationSettingsViewModel(DEFAULT_CLASSIFICATION_SETTINGS);
    expect(view.categories.find((category) => category.id === 'food')).toMatchObject({
      label: '식비',
      defaultFixedVariable: 'variable',
      mode: 'auto',
    });
    expect(view.categories.find((category) => category.id === 'subscription')).toMatchObject({
      defaultFixedVariable: 'fixed',
      mode: 'auto',
    });
  });

  it('adds, removes, restores, and protects income keywords', () => {
    const withCustom = addIncomeKeyword(DEFAULT_CLASSIFICATION_SETTINGS, '원고료');
    expect(classifyTransactionText('원고료 120000', now, rulesWithClassificationSettings(withCustom)).transactionType).toMatchObject({
      value: 'income',
      source: 'user-rule',
    });

    const withoutSalary = removeIncomeKeyword(withCustom, '월급');
    expect(classifyTransactionText('월급 2000000', now, rulesWithClassificationSettings(withoutSalary)).transactionType.value).toBe('expense');

    const restored = restoreIncomeKeywords(withoutSalary);
    expect(classifyTransactionText('월급 2000000', now, rulesWithClassificationSettings(restored)).transactionType.value).toBe('income');
    expect(classifyTransactionText('원고료 120000', now, rulesWithClassificationSettings(restored)).transactionType.value).toBe('expense');

    expect(() => addIncomeKeyword(DEFAULT_CLASSIFICATION_SETTINGS, '수입')).toThrow(/reserved/i);
    expect(() => addIncomeKeyword(DEFAULT_CLASSIFICATION_SETTINGS, '지출')).toThrow(/reserved/i);
  });

  it('adds, removes, restores, and validates category keywords', () => {
    const withCustom = addCategoryKeyword(DEFAULT_CLASSIFICATION_SETTINGS, 'food', '샌드위치');
    expect(classifyTransactionText('샌드위치 6500', now, rulesWithClassificationSettings(withCustom)).categoryId).toMatchObject({
      value: 'food',
      source: 'user-rule',
    });

    const withoutCoffee = removeCategoryKeyword(withCustom, 'food', '커피');
    expect(classifyTransactionText('커피 4500', now, rulesWithClassificationSettings(withoutCoffee)).categoryId.value).toBe('uncategorized');

    const restored = restoreCategoryKeywords(withoutCoffee, 'food');
    expect(classifyTransactionText('커피 4500', now, rulesWithClassificationSettings(restored)).categoryId.value).toBe('food');
    expect(classifyTransactionText('샌드위치 6500', now, rulesWithClassificationSettings(restored)).categoryId.value).toBe('uncategorized');

    expect(() => addCategoryKeyword(DEFAULT_CLASSIFICATION_SETTINGS, 'transport', '커피')).toThrow(/another category/i);
  });

  it('lets a user category rule override built-in keyword defaults', () => {
    const rules = rulesWithClassificationSettings({
      fixedVariableByCategory: { food: 'fixed' },
    });
    const result = classifyTransactionText('커피 4500', now, rules);
    expect(result.categoryId.value).toBe('food');
    expect(result.fixedVariable).toMatchObject({
      value: 'fixed',
      source: 'user-rule',
      confidence: 'high',
    });
  });

  it('treats auto as absence of an override', () => {
    const normalized = normalizeClassificationSettings({
      fixedVariableByCategory: {
        food: 'auto',
        subscription: 'variable',
      },
    });
    expect(normalized.fixedVariableByCategory).toEqual({ subscription: 'variable' });

    const rules = rulesWithClassificationSettings(normalized);
    expect(classifyTransactionText('커피 4500', now, rules).fixedVariable.value).toBe('variable');
    expect(classifyTransactionText('구독 17000', now, rules).fixedVariable.value).toBe('variable');
  });
});

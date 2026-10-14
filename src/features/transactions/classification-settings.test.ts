import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLASSIFICATION_SETTINGS,
  normalizeClassificationSettings,
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

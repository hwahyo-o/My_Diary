import { expect, it } from 'vitest';

import { assertLocalBudgetRevisionStable } from './cloud-budget-local-revision';

it('accepts an unchanged local vault revision', () => {
  expect(() => assertLocalBudgetRevisionStable(7, 7)).not.toThrow();
});

it('refuses a locally stale preview', () => {
  expect(() => assertLocalBudgetRevisionStable(7, 8)).toThrow('Local budget data changed');
});

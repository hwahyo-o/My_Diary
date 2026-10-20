import { expect, it } from 'vitest';
import { assertCloudBudgetRevisionConsistent } from './cloud-budget-revision-consistency';

it('accepts a stable remote HEAD and downloaded snapshot', () => {
  expect(() => assertCloudBudgetRevisionConsistent(5, 5, 5)).not.toThrow();
});
it.each([[5, 5, 6], [5, 6, 6], [6, 5, 6], [-1, -1, -1], [5, Number.NaN, 5]])(
  'rejects stale or invalid cloud budget revision triplet (%s, %s, %s)', (first, downloaded, latest) => {
    expect(() => assertCloudBudgetRevisionConsistent(first, downloaded, latest)).toThrow('revision changed');
  },
);

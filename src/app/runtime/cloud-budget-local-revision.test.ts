import { expect, it } from 'vitest';

function assertLocalRevisionStable(before: number, after: number): void {
  if (before !== after) throw new Error('Local budget data changed during cloud comparison; refresh before comparing.');
}

it('accepts an unchanged local vault revision', () => {
  expect(() => assertLocalRevisionStable(7, 7)).not.toThrow();
});

it('refuses a locally stale preview', () => {
  expect(() => assertLocalRevisionStable(7, 8)).toThrow('Local budget data changed');
});

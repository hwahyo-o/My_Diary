import { expect, it } from 'vitest';
import { parseISODate, parseISODateTime, parseUUID } from '../../domain/shared/types';
import { compareMonthlyBudgetSides } from './budget-side-comparison';

const month = parseISODate('2026-10-01');
const candidate = (suffix: string, limitMinor: number) => ({
  id: parseUUID(`00000000-0000-4000-8000-0000000000${suffix}`),
  month,
  updatedAt: parseISODateTime('2026-10-19T06:00:00.000Z'),
  limitMinor,
});

it('shows local and remote budgets separately without mutating either', () => {
  const local = [candidate('a1', 100000)];
  const remote = [candidate('b2', 200000)];
  const beforeLocal = structuredClone(local);
  const beforeRemote = structuredClone(remote);
  const result = compareMonthlyBudgetSides(local, remote, month);
  expect(result.local.latestLimitMinor).toBe(100000);
  expect(result.remote.latestLimitMinor).toBe(200000);
  expect(result.requiresReview).toBe(true);
  expect(local).toEqual(beforeLocal);
  expect(remote).toEqual(beforeRemote);
});

it('does not request review when both sides contain the same budgets in different order', () => {
  const entries = [candidate('a1', 100000), candidate('b2', 200000)];
  const result = compareMonthlyBudgetSides(entries, [...entries].reverse(), month);
  expect(result.sameLatestRecord).toBe(true);
  expect(result.requiresReview).toBe(false);
});

it('retains differences in history even when latest limits and IDs match', () => {
  const shared = candidate('b2', 200000);
  const result = compareMonthlyBudgetSides([candidate('a1', 100000), shared], [shared], month);
  expect(result.sameLatestRecord).toBe(true);
  expect(result.requiresReview).toBe(true);
});

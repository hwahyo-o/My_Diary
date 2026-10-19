import { describe, expect, it } from 'vitest';
import type { ISODate } from '../../domain/shared/types';
import { inspectMonthlyBudgets } from './budget-candidates';

const october = '2026-10-01' as ISODate;
const entries = [
  { id: 'device-a', month: october, updatedAt: '2026-10-19T05:00:00.000Z', limitMinor: 100000 },
  { id: 'device-b', month: october, updatedAt: '2026-10-19T05:00:00.000Z', limitMinor: 200000 },
] as const;

describe('decrypted monthly budget candidate inspection', () => {
  it('preserves both differing same-month candidates and deterministically sorts ties', () => {
    const first = inspectMonthlyBudgets(entries, october);
    const reverse = inspectMonthlyBudgets([...entries].reverse(), october);
    expect(first.selected?.id).toBe('device-b');
    expect(reverse.selected?.id).toBe('device-b');
    expect(first.alternatives.map((budget) => budget.id)).toEqual(['device-a']);
    expect(first.hasDifferingLimits).toBe(true);
    expect(entries).toHaveLength(2);
  });

  it('does not mark identical limits as differing even if multiple historical records exist', () => {
    const result = inspectMonthlyBudgets(entries.map((budget) => ({ ...budget, limitMinor: 100000 })), october);
    expect(result.hasDifferingLimits).toBe(false);
    expect(result.alternatives).toHaveLength(1);
  });

  it('does not import candidates from other months', () => {
    const september = '2026-09-01' as ISODate;
    const result = inspectMonthlyBudgets(entries, september);
    expect(result.selected).toBeUndefined();
    expect(result.alternatives).toEqual([]);
    expect(result.hasDifferingLimits).toBe(false);
  });
});

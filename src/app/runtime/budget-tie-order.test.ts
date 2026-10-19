import { expect, it } from 'vitest';
import type { Budget } from '../../domain/budgets/types';

// Equal edit timestamps can occur when two devices modify the same month offline.
// An ID tie-break makes the chosen record independent of merge/load iteration order.
it('orders parallel budgets deterministically with equal updated timestamps', () => {
  const common = {
    createdAt: '2026-10-19T12:00:00.000Z',
    updatedAt: '2026-10-19T12:00:00.000Z',
    version: 1,
    month: '2026-10-01',
    alertPercents: [50, 80, 100],
  } as const;
  const a = { ...common, id: '00000000-0000-4000-8000-000000000001', limitMinor: 100000 } as Budget;
  const b = { ...common, id: '00000000-0000-4000-8000-000000000002', limitMinor: 20000 } as Budget;
  const select = (items: Budget[]) => [...items]
    .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt) || y.id.localeCompare(x.id))[0];
  expect(select([a, b])?.id).toBe(b.id);
  expect(select([b, a])?.id).toBe(b.id);
});
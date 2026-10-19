import { expect, it } from 'vitest';
import { parseQuickInput } from './quick-parser';

const now = '2026-10-19T14:00:00.000+09:00' as Parameters<typeof parseQuickInput>[1];

it.each([
  ['2026-09-30 월급 2000000원', '2026-09-30', 'income', 2000000],
  ['2026.09.30 커피 4500원', '2026-09-30', 'expense', 4500],
  ['2026/10/01 점심 8000원', '2026-10-01', 'expense', 8000],
])('parses explicit date for %s', (text, day, type, amount) => {
  const parsed = parseQuickInput(text, now);
  expect(parsed.occurredAt.slice(0, 10)).toBe(day);
  expect(parsed.transactionType).toBe(type);
  expect(parsed.amountMinor).toBe(amount);
  expect(parsed.classification.needsReview).toBe(false);
});

it.each(['2026-02-30 점심 8000원', '2026-10-01 어제 점심 8000원', '2026-10-01 2026-10-02 커피 4500원'])(
  'requires review instead of silently saving ambiguous date %s', (text) => {
    const parsed = parseQuickInput(text, now);
    expect(parsed.classification.needsReview).toBe(true);
    expect(parsed.classification.reviewReasons).toContain('date-conflict');
  },
);

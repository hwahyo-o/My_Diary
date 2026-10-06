import type { Transaction } from '../../domain/transactions/types';
import type { TransactionDraft } from './types';

export type DuplicateRisk = 'none' | 'medium' | 'high';

export interface DuplicateMatch {
  readonly transaction: Transaction;
  readonly score: number;
}

export interface DuplicateResult {
  readonly risk: DuplicateRisk;
  readonly matches: readonly DuplicateMatch[];
}

function dayDistance(a: string, b: string): number {
  const delta = Math.abs(Date.parse(a) - Date.parse(b));
  return Math.floor(delta / 86_400_000);
}

function normalized(value?: string): string {
  return value?.trim().toLowerCase() ?? '';
}

export function detectDuplicateRisk(
  draft: TransactionDraft,
  candidates: readonly Transaction[],
): DuplicateResult {
  const matches = candidates
    .filter((item) => !item.deletedAt)
    .map((transaction) => {
      let score = 0;
      if (transaction.type === draft.type) score += 2;
      if (transaction.accountId === draft.accountId) score += 2;
      if (transaction.amountMinor === draft.amountMinor) score += 3;
      if (dayDistance(transaction.occurredAt, draft.occurredAt) <= 1) score += 2;
      if (normalized(transaction.merchant) && normalized(transaction.merchant) === normalized(draft.merchant)) score += 2;
      return { transaction, score };
    })
    .filter((item) => item.score >= 7)
    .sort((a, b) => b.score - a.score);

  const highest = matches[0]?.score ?? 0;
  return {
    risk: highest >= 11 ? 'high' : highest >= 7 ? 'medium' : 'none',
    matches,
  };
}

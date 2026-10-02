import type { Account, AccountPurpose } from './types';
import type { UUID } from '../shared/types';

export interface AccountPurposeBalance {
  readonly accountId: UUID;
  readonly balanceMinor: number;
}

export interface AccountPurposeBucket {
  readonly accountCount: number;
  readonly balanceMinor: number;
  readonly sharePercent: number;
}

export interface AccountPurposeAnalysis {
  readonly totalIncludedBalanceMinor: number;
  readonly byPurpose: Readonly<Record<AccountPurpose, AccountPurposeBucket>>;
}

const PURPOSES: readonly AccountPurpose[] = ['daily', 'fixed-cost', 'saving', 'emergency', 'investment', 'other'];

export function analyzeAccountPurposes(
  accounts: readonly Account[],
  balances: readonly AccountPurposeBalance[],
): AccountPurposeAnalysis {
  const balanceByAccount = new Map(balances.map((item) => [item.accountId, item.balanceMinor]));
  const raw = Object.fromEntries(PURPOSES.map((purpose) => [purpose, { accountCount: 0, balanceMinor: 0 }])) as Record<
    AccountPurpose,
    { accountCount: number; balanceMinor: number }
  >;

  for (const account of accounts) {
    if (!account.includeNetWorth) continue;
    const purpose = account.purpose ?? 'other';
    raw[purpose].accountCount += 1;
    raw[purpose].balanceMinor += balanceByAccount.get(account.id) ?? 0;
  }

  const totalIncludedBalanceMinor = PURPOSES.reduce((sum, purpose) => sum + raw[purpose].balanceMinor, 0);
  const byPurpose = Object.fromEntries(PURPOSES.map((purpose) => {
    const bucket = raw[purpose];
    return [purpose, Object.freeze({
      accountCount: bucket.accountCount,
      balanceMinor: bucket.balanceMinor,
      sharePercent: totalIncludedBalanceMinor === 0 ? 0 : (bucket.balanceMinor / totalIncludedBalanceMinor) * 100,
    })];
  })) as Record<AccountPurpose, AccountPurposeBucket>;

  return Object.freeze({
    totalIncludedBalanceMinor,
    byPurpose: Object.freeze(byPurpose),
  });
}

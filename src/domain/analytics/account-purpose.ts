import type { Account, AccountPurpose } from '../accounts/types';
import type { UUID } from '../shared/types';

export interface AccountPurposeBalance {
  readonly accountId: UUID;
  readonly balanceMinor: number;
}

export interface AccountPurposeAnalysis {
  readonly totalAssetBalanceMinor: number;
  readonly byPurpose: Readonly<Record<AccountPurpose, number>>;
  readonly purposeCoverage: number;
}

const EMPTY: Record<AccountPurpose, number> = {
  daily: 0,
  'fixed-cost': 0,
  saving: 0,
  emergency: 0,
  investment: 0,
  other: 0,
};

export function selectAccountPurposeAnalysis(
  accounts: readonly Account[],
  balances: readonly AccountPurposeBalance[],
): AccountPurposeAnalysis {
  const balanceByAccount = new Map(balances.map((item) => [item.accountId, item.balanceMinor]));
  const includedAssets = accounts.filter((account) =>
    account.includeNetWorth && account.kind !== 'loan' && account.kind !== 'credit');
  const byPurpose = { ...EMPTY };
  let totalAssetBalanceMinor = 0;
  let purposeAssignedCount = 0;

  for (const account of includedAssets) {
    const balance = Math.max(0, balanceByAccount.get(account.id) ?? 0);
    totalAssetBalanceMinor += balance;
    const purpose = account.purpose ?? 'other';
    byPurpose[purpose] += balance;
    if (account.purpose) purposeAssignedCount += 1;
  }

  return Object.freeze({
    totalAssetBalanceMinor,
    byPurpose: Object.freeze(byPurpose),
    purposeCoverage: includedAssets.length === 0 ? 0 : purposeAssignedCount / includedAssets.length,
  });
}

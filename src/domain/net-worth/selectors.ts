import type { Account } from '../accounts/types';
import type { Holding } from '../holdings/types';
import type { Loan } from '../loans/types';
import type { UUID } from '../shared/types';

export interface AccountBalance { readonly accountId: UUID; readonly balanceMinor: number; }
export interface CreditLiability { readonly accountId: UUID; readonly outstandingMinor: number; }
export interface NetWorthInput { readonly accounts: readonly Account[]; readonly balances: readonly AccountBalance[]; readonly holdings: readonly Holding[]; readonly loans: readonly Loan[]; readonly creditLiabilities?: readonly CreditLiability[]; }
export interface NetWorthResult { readonly liquidAssetsMinor:number; readonly investmentAssetsMinor:number; readonly totalAssetsMinor:number; readonly totalLiabilitiesMinor:number; readonly netWorthMinor:number; }

export function selectNetWorth(input: NetWorthInput): NetWorthResult {
  const included = new Map(input.accounts.filter(a=>a.includeNetWorth).map(a=>[a.id,a]));
  let liquidAssetsMinor = 0;
  for (const balance of input.balances) {
    const account = included.get(balance.accountId);
    if (!account || account.kind === 'credit' || account.kind === 'loan') continue;
    liquidAssetsMinor += balance.balanceMinor;
  }
  const investmentAssetsMinor = input.holdings.filter(h=>included.has(h.accountId)).reduce((sum,h)=>sum+h.marketValueMinor,0);
  const loanLiabilities = input.loans.filter(l=>included.has(l.accountId)).reduce((sum,l)=>sum+l.remainingPrincipalMinor,0);
  const creditLiabilities = (input.creditLiabilities ?? []).filter(c=>included.has(c.accountId)).reduce((sum,c)=>sum+c.outstandingMinor,0);
  const totalAssetsMinor = liquidAssetsMinor + investmentAssetsMinor;
  const totalLiabilitiesMinor = loanLiabilities + creditLiabilities;
  return { liquidAssetsMinor, investmentAssetsMinor, totalAssetsMinor, totalLiabilitiesMinor, netWorthMinor: totalAssetsMinor-totalLiabilitiesMinor };
}

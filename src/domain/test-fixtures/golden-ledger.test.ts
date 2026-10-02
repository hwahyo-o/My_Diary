import { describe, expect, it } from 'vitest';
import { getIncomeExpenseImpact } from '../transactions/accounting';
import { goldenExpected, goldenLedger } from './golden-ledger';

describe('golden ledger', () => {
  it('matches the hand-calculated monthly totals', () => {
    const impacts = goldenLedger.map(getIncomeExpenseImpact);
    const total = impacts.reduce((acc, item) => ({ incomeMinor:acc.incomeMinor+item.incomeMinor, expenseMinor:acc.expenseMinor+item.expenseMinor, principalReductionMinor:acc.principalReductionMinor+item.principalMovementMinor, investmentMovementMinor:acc.investmentMovementMinor+Math.max(item.investmentMovementMinor,0) }), { incomeMinor:0, expenseMinor:0, principalReductionMinor:0, investmentMovementMinor:0 });
    const savingMovementMinor = goldenLedger.filter(item=>item.type==='saving').reduce((sum,item)=>sum+item.amountMinor,0);
    expect({ ...total, savingMovementMinor }).toEqual(goldenExpected);
  });
});

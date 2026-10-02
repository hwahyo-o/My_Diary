import type { Transaction } from './types';

export interface IncomeExpenseImpact {
  readonly incomeMinor: number;
  readonly expenseMinor: number;
  readonly principalMovementMinor: number;
  readonly investmentMovementMinor: number;
}

export function getIncomeExpenseImpact(transaction: Transaction): IncomeExpenseImpact {
  const fee = transaction.feeMinor ?? 0;
  switch (transaction.type) {
    case 'income': return { incomeMinor: transaction.amountMinor, expenseMinor: 0, principalMovementMinor: 0, investmentMovementMinor: 0 };
    case 'expense': return { incomeMinor: 0, expenseMinor: transaction.amountMinor, principalMovementMinor: 0, investmentMovementMinor: 0 };
    case 'transfer':
    case 'saving': return { incomeMinor: 0, expenseMinor: 0, principalMovementMinor: transaction.amountMinor, investmentMovementMinor: 0 };
    case 'loan_payment': return { incomeMinor: 0, expenseMinor: (transaction.interestMinor ?? 0) + fee, principalMovementMinor: transaction.principalMinor ?? 0, investmentMovementMinor: 0 };
    case 'investment_buy': return { incomeMinor: 0, expenseMinor: fee, principalMovementMinor: 0, investmentMovementMinor: transaction.amountMinor };
    case 'investment_sell': return { incomeMinor: 0, expenseMinor: fee, principalMovementMinor: 0, investmentMovementMinor: -transaction.amountMinor };
    case 'adjustment': return { incomeMinor: 0, expenseMinor: 0, principalMovementMinor: 0, investmentMovementMinor: 0 };
  }
}

export function getInternalMovementImpact(transaction: Transaction): number {
  return transaction.type === 'transfer' || transaction.type === 'saving' || transaction.type === 'investment_buy' || transaction.type === 'investment_sell' || transaction.type === 'loan_payment' ? 0 : transaction.amountMinor;
}

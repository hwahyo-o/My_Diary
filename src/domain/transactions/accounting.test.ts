import { describe, expect, it } from 'vitest';
import { getIncomeExpenseImpact } from './accounting';
import type { Transaction } from './types';

const base = { id:'123e4567-e89b-42d3-a456-426614174000', accountId:'123e4567-e89b-42d3-a456-426614174001', createdAt:'2026-10-01T00:00:00+09:00', updatedAt:'2026-10-01T00:00:00+09:00', occurredAt:'2026-10-01T00:00:00+09:00', version:1 } as const;
const tx = (overrides: Partial<Transaction>): Transaction => ({ ...base, type:'expense', amountMinor:1000, ...overrides } as Transaction);

describe('accounting invariants', () => {
  it('counts income and consumer expense only once', () => {
    expect(getIncomeExpenseImpact(tx({ type:'income', amountMinor:3000000 }))).toMatchObject({ incomeMinor:3000000, expenseMinor:0 });
    expect(getIncomeExpenseImpact(tx({ type:'expense', amountMinor:12000 }))).toMatchObject({ incomeMinor:0, expenseMinor:12000 });
  });
  it('excludes transfer and saving from income/expense', () => {
    expect(getIncomeExpenseImpact(tx({ type:'transfer', amountMinor:500000 }))).toMatchObject({ incomeMinor:0, expenseMinor:0 });
    expect(getIncomeExpenseImpact(tx({ type:'saving', amountMinor:600000 }))).toMatchObject({ incomeMinor:0, expenseMinor:0 });
  });
  it('counts loan interest but not principal as expense', () => {
    expect(getIncomeExpenseImpact(tx({ type:'loan_payment', amountMinor:210000, principalMinor:200000, interestMinor:10000 }))).toEqual({ incomeMinor:0, expenseMinor:10000, principalMovementMinor:200000, investmentMovementMinor:0 });
  });
  it('treats investment buy as asset movement and only fee as expense', () => {
    expect(getIncomeExpenseImpact(tx({ type:'investment_buy', amountMinor:500000, feeMinor:1000 }))).toEqual({ incomeMinor:0, expenseMinor:1000, principalMovementMinor:0, investmentMovementMinor:500000 });
  });
});

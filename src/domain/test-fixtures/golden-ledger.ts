import type { Transaction } from '../transactions/types';

const common = { accountId:'123e4567-e89b-42d3-a456-426614174001', createdAt:'2026-09-01T00:00:00+09:00', updatedAt:'2026-09-01T00:00:00+09:00', occurredAt:'2026-09-01T00:00:00+09:00', version:1 } as const;
const ids = ['000','001','002','003','004','005'];
const make = (index:number, partial: Partial<Transaction>): Transaction => ({ ...common, id:`123e4567-e89b-42d3-a456-426614174${ids[index]}`, type:'expense', amountMinor:0, ...partial } as Transaction);

export const goldenLedger: readonly Transaction[] = [
  make(0,{type:'income',amountMinor:3000000}),
  make(1,{type:'expense',amountMinor:800000}),
  make(2,{type:'saving',amountMinor:600000}),
  make(3,{type:'loan_payment',amountMinor:210000,principalMinor:200000,interestMinor:10000}),
  make(4,{type:'investment_buy',amountMinor:500000,feeMinor:1000}),
  make(5,{type:'transfer',amountMinor:300000}),
];

export const goldenExpected = {
  incomeMinor: 3000000,
  expenseMinor: 811000,
  savingMovementMinor: 600000,
  principalReductionMinor: 200000,
  investmentMovementMinor: 500000,
} as const;

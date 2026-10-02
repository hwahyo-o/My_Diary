import { describe, expect, it } from 'vitest';
import { selectNetWorth } from './selectors';
import type { Account } from '../accounts/types';
import type { Holding } from '../holdings/types';
import type { Loan } from '../loans/types';

const d='2026-10-01T00:00:00+09:00' as const;
const date='2026-10-01' as const;
const id=(tail:string)=>`123e4567-e89b-42d3-a456-426614174${tail}` as any;
const account=(tail:string,kind:Account['kind'],includeNetWorth=true):Account=>({id:id(tail),name:kind,kind,includeNetWorth,createdAt:d as any,updatedAt:d as any,version:1});

describe('selectNetWorth',()=>{
  it('adds included cash and holdings and subtracts loan/card liabilities without double counting',()=>{
    const accounts=[account('000','checking'),account('001','brokerage'),account('002','loan'),account('003','credit'),account('004','savings',false)];
    const holdings:Holding[]=[{id:id('100'),accountId:id('001'),ticker:'TEST',quantity:'10',avgCostMinor:50000,marketValueMinor:600000,priceAsOf:date as any,createdAt:d as any,updatedAt:d as any,version:1}];
    const loans:Loan[]=[{id:id('200'),accountId:id('002'),remainingPrincipalMinor:900000,annualInterestRate:4.5,createdAt:d as any,updatedAt:d as any,version:1}];
    expect(selectNetWorth({accounts,balances:[{accountId:id('000'),balanceMinor:2000000},{accountId:id('001'),balanceMinor:100000},{accountId:id('004'),balanceMinor:999999}],holdings,loans,creditLiabilities:[{accountId:id('003'),outstandingMinor:300000}]})).toEqual({liquidAssetsMinor:2100000,investmentAssetsMinor:600000,totalAssetsMinor:2700000,totalLiabilitiesMinor:1200000,netWorthMinor:1500000});
  });
  it('keeps net worth unchanged when equal cash and loan principal are reduced',()=>{
    const accounts=[account('000','checking'),account('002','loan')];
    const before=selectNetWorth({accounts,balances:[{accountId:id('000'),balanceMinor:1000000}],holdings:[],loans:[{id:id('200'),accountId:id('002'),remainingPrincipalMinor:800000,annualInterestRate:4,createdAt:d as any,updatedAt:d as any,version:1}]});
    const after=selectNetWorth({accounts,balances:[{accountId:id('000'),balanceMinor:800000}],holdings:[],loans:[{id:id('200'),accountId:id('002'),remainingPrincipalMinor:600000,annualInterestRate:4,createdAt:d as any,updatedAt:d as any,version:1}]});
    expect(before.netWorthMinor).toBe(200000);
    expect(after.netWorthMinor).toBe(200000);
  });
});

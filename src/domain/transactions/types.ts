import type { EntityMeta, ISODateTime, UUID } from '../shared/types';

export type TransactionType = 'income' | 'expense' | 'transfer' | 'saving' | 'loan_payment' | 'investment_buy' | 'investment_sell' | 'adjustment';

export interface Transaction extends EntityMeta {
  readonly type: TransactionType;
  readonly accountId: UUID;
  readonly counterAccountId?: UUID;
  readonly amountMinor: number;
  readonly occurredAt: ISODateTime;
  readonly categoryId?: string;
  readonly merchant?: string;
  readonly memo?: string;
  readonly principalMinor?: number;
  readonly interestMinor?: number;
  readonly feeMinor?: number;
}

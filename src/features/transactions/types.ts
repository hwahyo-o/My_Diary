import type { ISODateTime, UUID } from '../../domain/shared/types';
import type { FixedVariable, TransactionSource, TransactionType } from '../../domain/transactions/types';

export interface TransactionDraft {
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
  readonly source: TransactionSource;
  readonly fixedVariable: FixedVariable;
}

export interface DirectTransactionInput extends Omit<TransactionDraft, 'source' | 'fixedVariable'> {
  readonly fixedVariable?: FixedVariable;
}

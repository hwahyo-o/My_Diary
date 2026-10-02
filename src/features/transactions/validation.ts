import type { FixedVariable } from '../../domain/transactions/types';
import type { DirectTransactionInput, TransactionDraft } from './types';

type DraftInput = Omit<TransactionDraft, 'fixedVariable'> & { readonly fixedVariable?: FixedVariable };

export function validateTransactionDraft(input: DraftInput): TransactionDraft {
  const draft: TransactionDraft = {
    ...input,
    fixedVariable: input.fixedVariable ?? 'variable',
  };

  if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor <= 0) {
    throw new TypeError('Transaction amountMinor must be a positive safe integer.');
  }

  if (draft.type === 'transfer') {
    if (!draft.counterAccountId || draft.counterAccountId === draft.accountId) {
      throw new TypeError('Transfer requires a distinct counter account.');
    }
  }

  if (draft.type === 'loan_payment') {
    const principal = draft.principalMinor ?? 0;
    const interest = draft.interestMinor ?? 0;
    if (principal < 0 || interest < 0 || principal + interest !== draft.amountMinor) {
      throw new TypeError('Loan payment must split amount into principal and interest.');
    }
  }

  return draft;
}

export function createDirectDraft(input: DirectTransactionInput): TransactionDraft {
  return validateTransactionDraft({
    ...input,
    source: 'manual',
  });
}

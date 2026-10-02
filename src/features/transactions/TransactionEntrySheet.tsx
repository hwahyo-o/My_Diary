import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { AccountSummaryViewModel, TransactionSubmission } from '../../app/ui-types';
import type { TransactionType } from '../../domain/transactions/types';

interface TransactionEntrySheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmitTransaction: (input: TransactionSubmission) => void | Promise<void>;
  readonly accounts?: readonly AccountSummaryViewModel[];
  readonly returnFocusTo?: HTMLElement | null;
}

const TYPE_OPTIONS: readonly { value: TransactionType; label: string }[] = [
  { value: 'expense', label: '지출' },
  { value: 'income', label: '수입' },
  { value: 'transfer', label: '이체' },
  { value: 'saving', label: '저축' },
  { value: 'loan_payment', label: '대출 상환' },
  { value: 'investment_buy', label: '투자 매수' },
  { value: 'investment_sell', label: '투자 매도' },
];

export function TransactionEntrySheet({ open, onClose, onSubmitTransaction, accounts = [], returnFocusTo }: TransactionEntrySheetProps) {
  const [tab, setTab] = useState<'quick' | 'direct'>('quick');
  const [quickText, setQuickText] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [accountId, setAccountId] = useState('');
  const [counterAccountId, setCounterAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [principal, setPrincipal] = useState('');
  const [interest, setInterest] = useState('');
  const [fee, setFee] = useState('');

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open && returnFocusTo) returnFocusTo.focus();
  }, [open, returnFocusTo]);

  if (!open) return null;

  function submitQuick(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = quickText.trim();
    if (!text) return;
    void onSubmitTransaction({ mode: 'quick', text });
  }

  function numeric(value: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
  }

  function submitDirect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = Number(amount);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return;
    const common = {
      mode: 'direct' as const,
      amountMinor,
      memo: memo.trim(),
      ...(type === 'expense' ? {} : { type }),
      ...(accountId ? { accountId } : {}),
      ...(counterAccountId ? { counterAccountId } : {}),
    };
    const submission: TransactionSubmission = type === 'loan_payment'
      ? { ...common, type, principalMinor: numeric(principal) ?? 0, interestMinor: numeric(interest) ?? 0 }
      : type === 'investment_buy' || type === 'investment_sell'
        ? { ...common, type, feeMinor: numeric(fee) ?? 0 }
        : common;
    void onSubmitTransaction(submission);
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="transaction-sheet" role="dialog" aria-modal="true" aria-labelledby="transaction-sheet-title">
        <div className="sheet-header">
          <div>
            <p className="eyebrow">TRANSACTION</p>
            <h2 id="transaction-sheet-title">거래 추가</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="entry-tabs" aria-label="거래 입력 방식">
          <button type="button" aria-pressed={tab === 'quick'} onClick={() => setTab('quick')}>빠른 입력</button>
          <button type="button" aria-pressed={tab === 'direct'} onClick={() => setTab('direct')}>직접 입력</button>
        </div>

        {tab === 'quick' ? (
          <form className="entry-form" onSubmit={submitQuick}>
            <label>
              <span>빠른 입력</span>
              <input aria-label="빠른 입력" value={quickText} onChange={(event) => setQuickText(event.currentTarget.value)} placeholder="예: 점심 만삼천" autoFocus />
            </label>
            <button className="primary-button" type="submit">빠른 입력 저장</button>
          </form>
        ) : (
          <form className="entry-form" onSubmit={submitDirect}>
            <label>
              <span>거래 유형</span>
              <select aria-label="거래 유형" value={type} onChange={(event) => setType(event.currentTarget.value as TransactionType)}>
                {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {accounts.length > 0 && (
              <label>
                <span>계좌</span>
                <select aria-label="계좌" value={accountId} onChange={(event) => setAccountId(event.currentTarget.value)}>
                  <option value="">기본 계좌</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
            )}
            {(type === 'transfer' || type === 'saving' || type === 'loan_payment') && accounts.length > 1 && (
              <label>
                <span>상대 계좌</span>
                <select aria-label="상대 계좌" value={counterAccountId} onChange={(event) => setCounterAccountId(event.currentTarget.value)}>
                  <option value="">선택</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
            )}
            <label>
              <span>금액</span>
              <input aria-label="금액" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.currentTarget.value.replace(/\D/g, ''))} />
            </label>
            {type === 'loan_payment' && (
              <>
                <label><span>원금</span><input aria-label="원금" inputMode="numeric" value={principal} onChange={(event) => setPrincipal(event.currentTarget.value.replace(/\D/g, ''))} /></label>
                <label><span>이자</span><input aria-label="이자" inputMode="numeric" value={interest} onChange={(event) => setInterest(event.currentTarget.value.replace(/\D/g, ''))} /></label>
              </>
            )}
            {(type === 'investment_buy' || type === 'investment_sell') && (
              <label><span>수수료</span><input aria-label="수수료" inputMode="numeric" value={fee} onChange={(event) => setFee(event.currentTarget.value.replace(/\D/g, ''))} /></label>
            )}
            <label>
              <span>메모</span>
              <input aria-label="메모" value={memo} onChange={(event) => setMemo(event.currentTarget.value)} />
            </label>
            <button className="primary-button" type="submit">직접 입력 저장</button>
          </form>
        )}
      </section>
    </div>
  );
}

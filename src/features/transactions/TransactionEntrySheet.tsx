import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { QuickTransactionPreviewViewModel, TransactionSubmission } from '../../app/ui-types';

interface TransactionEntrySheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmitTransaction: (input: TransactionSubmission) => void | Promise<void>;
  readonly onPreviewQuickTransaction?: (text: string) => QuickTransactionPreviewViewModel;
  readonly returnFocusTo?: HTMLElement | null;
}

export function TransactionEntrySheet({ open, onClose, onSubmitTransaction, onPreviewQuickTransaction, returnFocusTo }: TransactionEntrySheetProps) {
  const [tab, setTab] = useState<'quick' | 'direct'>('quick');
  const [quickText, setQuickText] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = quickText.trim() && onPreviewQuickTransaction
    ? onPreviewQuickTransaction(quickText)
    : null;

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

  async function submitQuick(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const text = quickText.trim();
    if (!text) {
      setError('빠른 입력 내용을 입력해주세요.');
      return;
    }

    if (preview?.needsReview) {
      setError('자동 분류 결과가 충돌합니다. 입력 내용을 수정해주세요.');
      return;
    }
    if (preview?.unresolvedAmount) {
      setError('금액을 함께 입력해주세요.');
      return;
    }

    setBusy(true);
    try {
      await onSubmitTransaction({ mode: 'quick', text });
      setQuickText('');
      onClose();
    } catch {
      setError('거래를 저장하지 못했습니다. 금액과 입력 내용을 확인해주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function submitDirect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const amountMinor = Number(amount);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      setError('금액은 1원 이상의 숫자로 입력해주세요.');
      return;
    }

    setBusy(true);
    try {
      await onSubmitTransaction({ mode: 'direct', amountMinor, memo: memo.trim() });
      setAmount('');
      setMemo('');
      onClose();
    } catch {
      setError('거래를 저장하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
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
          <button type="button" aria-pressed={tab === 'quick'} onClick={() => { setTab('quick'); setError(null); }}>빠른 입력</button>
          <button type="button" aria-pressed={tab === 'direct'} onClick={() => { setTab('direct'); setError(null); }}>직접 입력</button>
        </div>

        {tab === 'quick' ? (
          <form className="entry-form" onSubmit={submitQuick}>
            <label>
              <span>빠른 입력</span>
              <input aria-label="빠른 입력" value={quickText} onChange={(event) => { setQuickText(event.currentTarget.value); setError(null); }} placeholder="예: 그제 커피 4,500원" autoFocus />
            </label>
            {preview ? (
              <div className={preview.needsReview ? 'quick-preview warning' : 'quick-preview'} aria-live="polite">
                <div className="quick-preview-heading">
                  <strong>자동 분류 미리보기</strong>
                  <span className={preview.needsReview ? 'status-chip warning' : 'status-chip'}>
                    {preview.needsReview ? '확인 필요' : preview.unresolvedAmount ? '금액 필요' : '저장 가능'}
                  </span>
                </div>
                <dl className="quick-preview-grid">
                  <div><dt>유형</dt><dd>{preview.transactionType === 'income' ? '수입' : preview.transactionType === 'expense' ? '지출' : preview.transactionType}</dd></div>
                  <div><dt>카테고리</dt><dd>{preview.categoryLabel}</dd></div>
                  <div><dt>고정/변동</dt><dd>{preview.fixedVariable === 'fixed' ? '고정' : preview.fixedVariable === 'variable' ? '변동' : '혼합'}</dd></div>
                  <div><dt>날짜</dt><dd>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(preview.occurredAt))}</dd></div>
                  <div><dt>금액</dt><dd>{preview.amountMinor === null ? '입력 필요' : `₩${preview.amountMinor.toLocaleString('ko-KR')}`}</dd></div>
                </dl>
              </div>
            ) : null}
            {error ? <p role="alert" className="form-error">{error}</p> : null}
            <button className="primary-button" type="submit" disabled={busy || !!preview?.needsReview || !!preview?.unresolvedAmount}>빠른 입력 저장</button>
          </form>
        ) : (
          <form className="entry-form" onSubmit={submitDirect}>
            <label>
              <span>금액</span>
              <input aria-label="금액" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.currentTarget.value.replace(/\D/g, ''))} />
            </label>
            <label>
              <span>메모</span>
              <input aria-label="메모" value={memo} onChange={(event) => setMemo(event.currentTarget.value)} />
            </label>
            {error ? <p role="alert" className="form-error">{error}</p> : null}
            <button className="primary-button" type="submit" disabled={busy}>직접 입력 저장</button>
          </form>
        )}
      </section>
    </div>
  );
}

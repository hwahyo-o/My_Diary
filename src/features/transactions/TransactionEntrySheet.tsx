import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { QuickTransactionCorrection, QuickTransactionPreviewViewModel, QuickBatchPreview, QuickBatchEntryCorrection, TransactionSubmission } from '../../app/ui-types';
import { BUILTIN_CATEGORIES } from './category-catalog';

interface TransactionEntrySheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmitTransaction: (input: TransactionSubmission) => void | Promise<void>;
  readonly onPreviewQuickBatch?: (text: string) => QuickBatchPreview;
  readonly onPreviewQuickTransaction?: (text: string) => QuickTransactionPreviewViewModel;
  readonly returnFocusTo?: HTMLElement | null;
}

function toDateInputValue(occurredAt: string): string {
  const date = new Date(occurredAt);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function correctionFromPreview(preview: QuickTransactionPreviewViewModel): QuickTransactionCorrection {
  return {
    transactionType: preview.transactionType === 'income' ? 'income' : 'expense',
    categoryId: preview.categoryId,
    fixedVariable: preview.fixedVariable,
    occurredAt: `${toDateInputValue(preview.occurredAt)}T12:00:00.000+09:00`,
  };
}

export function TransactionEntrySheet({ open, onClose, onSubmitTransaction, onPreviewQuickTransaction, onPreviewQuickBatch, returnFocusTo }: TransactionEntrySheetProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'quick' | 'direct'>('quick');
  const [quickText, setQuickText] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchEdits, setBatchEdits] = useState<QuickBatchEntryCorrection[] | null>(null);
  const [correction, setCorrection] = useState<QuickTransactionCorrection | null>(null);
  const batch = quickText.trim() && onPreviewQuickBatch ? onPreviewQuickBatch(quickText) : null;
  const isBatch = (batch?.entries.length ?? 0) > 1;
  const preview = !isBatch && quickText.trim() && onPreviewQuickTransaction
    ? onPreviewQuickTransaction(quickText)
    : null;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter((node) => node.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open && returnFocusTo) returnFocusTo.focus();
  }, [open, returnFocusTo]);

  useEffect(() => {
    if (!open) return;
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    const updateViewport = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      backdrop.style.height = `${Math.max(0, height)}px`;
      backdrop.style.top = `${offsetTop}px`;
    };
    updateViewport();
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, [open]);

  if (!open) return null;

  async function submitQuick(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const text = quickText.trim();
    if (!text) {
      setError('빠른 입력 내용을 입력해주세요.');
      return;
    }

    if (isBatch) {
      if (!batch || (!batchEdits && !batch.valid) || (batchEdits && batchEdits.length !== batch.entries.length)) { setError('거래별 수정값을 확인해주세요.'); return; }
      setBusy(true);
      try {
        await onSubmitTransaction({ mode: 'batch', text, ...(batchEdits ? { entries: batchEdits } : {}) });
        setBatchEdits(null);
        setQuickText('');
        onClose();
      } catch {
        setError('일괄 거래를 저장하지 못했습니다. 다시 확인해주세요.');
      } finally { setBusy(false); }
      return;
    }
    if (preview?.multipleAmounts) {
      setError('금액이 여러 개 감지되었습니다. 각 거래를 나누어 입력해주세요.');
      return;
    }
    if (preview?.needsReview && !correction) {
      setError('자동 분류 결과가 충돌합니다. 분류 수정을 완료해주세요.');
      return;
    }
    if (preview?.unresolvedAmount) {
      setError('금액을 함께 입력해주세요.');
      return;
    }

    setBusy(true);
    try {
      await onSubmitTransaction({ mode: 'quick', text, ...(correction ? { correction } : {}) });
      setQuickText('');
      setCorrection(null);
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
    <div ref={backdropRef} className="sheet-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="transaction-sheet" role="dialog" aria-modal="true" aria-labelledby="transaction-sheet-title">
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
              <input
                aria-label="빠른 입력"
                value={quickText}
                onChange={(event) => {
                  setQuickText(event.currentTarget.value);
                  setCorrection(null);
                  setBatchEdits(null);
                  setError(null);
                }}
                placeholder="예: 그제 커피 4,500원"
                autoFocus
              />
            </label>
            {isBatch && batch ? (
              <div className="quick-preview" aria-live="polite">
                <strong>거래 {batch.entries.length}건 일괄 미리보기</strong>
                {batch.entries.map((entry, index) => {
                  const edit = batchEdits?.[index];
                  const update = (changes: Partial<QuickBatchEntryCorrection>) => {
                    setBatchEdits((current) => current?.map((value, position) =>
                      position === index ? { ...value, ...changes } : value) ?? null);
                  };
                  return (
                    <div className="quick-batch-entry" key={index}>
                      <strong>{index + 1}. {entry.text}</strong>
                      {edit ? (
                        <div className="quick-correction-grid">
                          <label>금액<input aria-label={`거래 ${index + 1} 금액`} type="number" min="1" step="1" value={edit.amountMinor}
                            onChange={(event) => update({ amountMinor: Number(event.currentTarget.value) })} /></label>
                          <label>유형<select aria-label={`거래 ${index + 1} 유형`} value={edit.transactionType}
                            onChange={(event) => update({ transactionType: event.currentTarget.value as 'income' | 'expense' })}>
                            <option value="expense">지출</option><option value="income">수입</option></select></label>
                          <label>카테고리<select aria-label={`거래 ${index + 1} 카테고리`} value={edit.categoryId}
                            onChange={(event) => update({ categoryId: event.currentTarget.value })}>
                            {BUILTIN_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                          </select></label>
                          <label>고정/변동<select aria-label={`거래 ${index + 1} 고정 변동`} value={edit.fixedVariable}
                            onChange={(event) => update({ fixedVariable: event.currentTarget.value as QuickBatchEntryCorrection['fixedVariable'] })}>
                            <option value="fixed">고정</option><option value="variable">변동</option><option value="mixed">혼합</option></select></label>
                          <label>날짜<input aria-label={`거래 ${index + 1} 날짜`} type="date" value={toDateInputValue(edit.occurredAt)}
                            onChange={(event) => update({ occurredAt: `${event.currentTarget.value}T12:00:00.000+09:00` })} /></label>
                        </div>
                      ) : (
                        <p>{entry.categoryLabel} · {entry.occurredAt.slice(0, 10)} · {entry.amountMinor === null ? '금액 확인' : `₩${entry.amountMinor.toLocaleString('ko-KR')}`}</p>
                      )}
                    </div>
                  );
                })}
                <button type="button" className="secondary-button" onClick={() => setBatchEdits((current) =>
                  current ? null : batch.entries.map((entry) => ({
                    text: entry.text, amountMinor: entry.amountMinor ?? 0,
                    ...correctionFromPreview(entry),
                  })))}>{batchEdits ? '자동 분류로 되돌리기' : '거래별 수정'}</button>
                <strong>합계 ₩{(batchEdits ?? batch.entries).reduce((sum, item) => sum + (item.amountMinor ?? 0), 0).toLocaleString('ko-KR')}</strong>
              </div>
            ) : null}
            {preview ? (
              <div className={preview.needsReview && !correction ? 'quick-preview warning' : 'quick-preview'} aria-live="polite">
                <div className="quick-preview-heading">
                  <strong>{correction ? '수정된 분류' : '자동 분류 미리보기'}</strong>
                  <span className={preview.needsReview && !correction ? 'status-chip warning' : 'status-chip'}>
                    {preview.multipleAmounts ? '여러 거래 감지' : preview.needsReview && !correction ? '확인 필요' : preview.unresolvedAmount ? '금액 필요' : correction ? '수정 완료' : '저장 가능'}
                  </span>
                </div>

                {correction ? (
                  <div className="quick-correction-grid">
                    <label>
                      <span>유형</span>
                      <select
                        aria-label="거래 유형 수정"
                        value={correction.transactionType}
                        onChange={(event) => setCorrection({ ...correction, transactionType: event.currentTarget.value as 'income' | 'expense' })}
                      >
                        <option value="expense">지출</option>
                        <option value="income">수입</option>
                      </select>
                    </label>
                    <label>
                      <span>카테고리</span>
                      <select
                        aria-label="카테고리 수정"
                        value={correction.categoryId}
                        onChange={(event) => setCorrection({ ...correction, categoryId: event.currentTarget.value })}
                      >
                        {BUILTIN_CATEGORIES.map((category) => (
                          <option key={category.id} value={category.id}>{category.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>고정/변동</span>
                      <select
                        aria-label="고정 변동 수정"
                        value={correction.fixedVariable}
                        onChange={(event) => setCorrection({ ...correction, fixedVariable: event.currentTarget.value as QuickTransactionCorrection['fixedVariable'] })}
                      >
                        <option value="fixed">고정</option>
                        <option value="variable">변동</option>
                        <option value="mixed">혼합</option>
                      </select>
                    </label>
                    <label>
                      <span>날짜</span>
                      <input
                        aria-label="거래 날짜 수정"
                        type="date"
                        value={toDateInputValue(correction.occurredAt)}
                        onChange={(event) => setCorrection({ ...correction, occurredAt: `${event.currentTarget.value}T12:00:00.000+09:00` })}
                      />
                    </label>
                    <button type="button" className="secondary-button" onClick={() => setCorrection(null)}>자동 분류로 되돌리기</button>
                  </div>
                ) : (
                  <>
                    <dl className="quick-preview-grid">
                      <div><dt>유형</dt><dd>{preview.transactionType === 'income' ? '수입' : preview.transactionType === 'expense' ? '지출' : preview.transactionType}</dd></div>
                      <div><dt>카테고리</dt><dd>{preview.categoryLabel}</dd></div>
                      <div><dt>고정/변동</dt><dd>{preview.fixedVariable === 'fixed' ? '고정' : preview.fixedVariable === 'variable' ? '변동' : '혼합'}</dd></div>
                      <div><dt>날짜</dt><dd>{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(preview.occurredAt))}</dd></div>
                      <div><dt>금액</dt><dd>{preview.amountMinor === null ? '입력 필요' : `₩${preview.amountMinor.toLocaleString('ko-KR')}`}</dd></div>
                    </dl>
                    <button
                      type="button"
                      className="secondary-button quick-correction-button"
                      onClick={() => {
                        setCorrection(correctionFromPreview(preview));
                        setError(null);
                      }}
                    >
                      분류 수정
                    </button>
                  </>
                )}
              </div>
            ) : null}
            {preview?.multipleAmounts ? <p role="alert" className="form-error">여러 금액이 감지되었습니다. 거래별로 나누어 입력해야 안전하게 저장할 수 있습니다.</p> : null}
            {error ? <p role="alert" className="form-error">{error}</p> : null}
            <button className="primary-button" type="submit" disabled={busy || (isBatch && (!batchEdits ? !batch?.valid : batchEdits.some((entry) => !Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0 || Number.isNaN(new Date(entry.occurredAt).getTime())))) || !!preview?.multipleAmounts || (!!preview?.needsReview && !correction) || !!preview?.unresolvedAmount}>{isBatch ? '거래 전체 저장' : '빠른 입력 저장'}</button>
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

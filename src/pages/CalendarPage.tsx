import { useMemo, useState, type FormEvent } from 'react';
import type { CalendarTransactionViewModel, CalendarViewModel, UpdateTransactionInput } from '../app/ui-types';

interface CalendarPageProps {
  readonly calendar: CalendarViewModel;
  readonly onQuickAdd: () => void;
  readonly onUpdateTransaction: (input: UpdateTransactionInput) => Promise<void>;
  readonly onDeleteTransaction: (id: string) => Promise<void>;
  readonly onRestoreTransaction: (id: string) => Promise<void>;
}

const TYPE_LABELS: Readonly<Record<string, string>> = {
  income: '수입',
  expense: '지출',
  transfer: '이체',
  saving: '저축',
  loan_payment: '대출 상환',
  investment_buy: '투자 매수',
  investment_sell: '투자 매도',
  adjustment: '조정',
};

const money = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
});

const monthLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' });
const dayLabel = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
const timeLabel = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthKey(date: Date): string {
  return dateKey(new Date(date.getFullYear(), date.getMonth(), 1)).slice(0, 7);
}

function dayCount(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function signedAmount(transaction: CalendarTransactionViewModel): string {
  if (transaction.direction === 'income') return `+${money.format(transaction.amountMinor)}`;
  if (transaction.direction === 'expense') return `-${money.format(transaction.amountMinor)}`;
  return money.format(transaction.amountMinor);
}

function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export function CalendarPage({
  calendar,
  onQuickAdd,
  onUpdateTransaction,
  onDeleteTransaction,
  onRestoreTransaction,
}: CalendarPageProps) {
  const initialToday = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(() => new Date(initialToday.getFullYear(), initialToday.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(initialToday));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editOccurredAt, setEditOccurredAt] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [lastDeletedId, setLastDeletedId] = useState<string | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const transactionsByDate = useMemo(() => {
    const map = new Map<string, CalendarTransactionViewModel[]>();
    for (const transaction of calendar.transactions) {
      const key = transaction.occurredAt.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(transaction);
      map.set(key, list);
    }
    return map;
  }, [calendar.transactions]);

  const currentMonthKey = monthKey(viewMonth);
  const monthTransactions = calendar.transactions.filter((transaction) => transaction.occurredAt.startsWith(currentMonthKey));
  const monthIncome = monthTransactions
    .filter((transaction) => transaction.direction === 'income')
    .reduce((sum, transaction) => sum + transaction.amountMinor, 0);
  const monthExpense = monthTransactions
    .filter((transaction) => transaction.direction === 'expense')
    .reduce((sum, transaction) => sum + transaction.amountMinor, 0);

  const firstWeekday = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const days = Array.from({ length: firstWeekday + dayCount(viewMonth) }, (_, index) => (
    index < firstWeekday ? null : index - firstWeekday + 1
  ));

  const selectedTransactions = (transactionsByDate.get(selectedDate) ?? [])
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const selectedIncome = selectedTransactions
    .filter((transaction) => transaction.direction === 'income')
    .reduce((sum, transaction) => sum + transaction.amountMinor, 0);
  const selectedExpense = selectedTransactions
    .filter((transaction) => transaction.direction === 'expense')
    .reduce((sum, transaction) => sum + transaction.amountMinor, 0);

  function moveMonth(delta: number) {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
    setViewMonth(next);
    setSelectedDate(dateKey(next));
    setEditingId(null);
    setDeleteConfirmId(null);
  }

  function goToday() {
    const today = new Date();
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(dateKey(today));
  }

  function startEdit(transaction: CalendarTransactionViewModel) {
    setMutationError(null);
    setDeleteConfirmId(null);
    setEditingId(transaction.id);
    setEditLabel(transaction.label === '거래' ? '' : transaction.label);
    setEditAmount(String(transaction.amountMinor));
    setEditOccurredAt(toLocalDateTimeInput(transaction.occurredAt));
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    const amountMinor = Number(editAmount);
    const date = new Date(editOccurredAt);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      setMutationError('금액은 1원 이상의 숫자로 입력해주세요.');
      return;
    }
    if (!editOccurredAt || Number.isNaN(date.getTime())) {
      setMutationError('거래 일시를 확인해주세요.');
      return;
    }

    setMutationBusy(true);
    setMutationError(null);
    try {
      await onUpdateTransaction({
        id: editingId,
        amountMinor,
        label: editLabel.trim(),
        occurredAt: date.toISOString(),
      });
      setEditingId(null);
    } catch {
      setMutationError('거래를 수정하지 못했습니다. 다른 기기에서 동시에 수정했는지 확인해주세요.');
    } finally {
      setMutationBusy(false);
    }
  }

  async function confirmDelete(id: string) {
    setMutationBusy(true);
    setMutationError(null);
    try {
      await onDeleteTransaction(id);
      setDeleteConfirmId(null);
      setEditingId(null);
      setLastDeletedId(id);
    } catch {
      setMutationError('거래를 삭제하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setMutationBusy(false);
    }
  }

  async function restoreLastDeleted() {
    if (!lastDeletedId) return;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await onRestoreTransaction(lastDeletedId);
      setLastDeletedId(null);
    } catch {
      setMutationError('삭제한 거래를 복구하지 못했습니다.');
    } finally {
      setMutationBusy(false);
    }
  }

  return (
    <section className="page-stack calendar-page" aria-labelledby="calendar-title">
      <header className="page-header calendar-page-header">
        <div>
          <p className="eyebrow">LEDGER</p>
          <h1 id="calendar-title">캘린더</h1>
          <p className="calendar-lead">월별 흐름을 보고 날짜별 거래를 확인·수정·삭제합니다.</p>
        </div>
        <button type="button" className="primary-button" onClick={onQuickAdd}>거래 추가</button>
      </header>

      <div className="calendar-summary-grid" aria-label="월간 거래 요약">
        <article className="calendar-summary-card">
          <span>이번 달 수입</span>
          <strong className="money-income">{money.format(monthIncome)}</strong>
        </article>
        <article className="calendar-summary-card">
          <span>이번 달 지출</span>
          <strong className="money-expense">{money.format(monthExpense)}</strong>
        </article>
        <article className="calendar-summary-card">
          <span>순흐름</span>
          <strong>{money.format(monthIncome - monthExpense)}</strong>
        </article>
        <article className="calendar-summary-card">
          <span>거래 건수</span>
          <strong>{monthTransactions.length}건</strong>
        </article>
      </div>

      <div className="calendar-layout">
        <article className="calendar-card">
          <div className="calendar-toolbar">
            <div className="calendar-month-title" aria-live="polite">{monthLabel.format(viewMonth)}</div>
            <div className="calendar-toolbar-actions">
              <button type="button" className="calendar-nav-button" aria-label="이전 달" onClick={() => moveMonth(-1)}>‹</button>
              <button type="button" className="text-button" onClick={goToday}>오늘</button>
              <button type="button" className="calendar-nav-button" aria-label="다음 달" onClick={() => moveMonth(1)}>›</button>
            </div>
          </div>

          <div className="calendar-weekdays" aria-hidden="true">
            {['일', '월', '화', '수', '목', '금', '토'].map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>

          <div className="calendar-grid" role="grid" aria-label={`${monthLabel.format(viewMonth)} 거래 달력`}>
            {days.map((day, index) => {
              if (day === null) return <span key={`empty-${index}`} className="calendar-day-empty" aria-hidden="true" />;

              const dayDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
              const key = dateKey(dayDate);
              const transactions = transactionsByDate.get(key) ?? [];
              const income = transactions
                .filter((transaction) => transaction.direction === 'income')
                .reduce((sum, transaction) => sum + transaction.amountMinor, 0);
              const expense = transactions
                .filter((transaction) => transaction.direction === 'expense')
                .reduce((sum, transaction) => sum + transaction.amountMinor, 0);
              const isToday = key === dateKey(initialToday);
              const isSelected = key === selectedDate;

              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  className="calendar-day"
                  data-selected={isSelected || undefined}
                  data-today={isToday || undefined}
                  aria-label={`${dayLabel.format(dayDate)}, 거래 ${transactions.length}건`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedDate(key);
                    setEditingId(null);
                    setDeleteConfirmId(null);
                  }}
                >
                  <span className="calendar-day-number">{day}</span>
                  <span className="calendar-day-values" aria-hidden="true">
                    {income > 0 ? <small className="money-income">+{money.format(income)}</small> : null}
                    {expense > 0 ? <small className="money-expense">-{money.format(expense)}</small> : null}
                  </span>
                  {transactions.length > 0 ? <span className="calendar-day-count">{transactions.length}</span> : null}
                </button>
              );
            })}
          </div>
        </article>

        <aside className="calendar-detail-card" aria-labelledby="selected-date-title">
          <div className="calendar-detail-heading">
            <div>
              <p className="card-kicker">SELECTED DAY</p>
              <h2 id="selected-date-title">{dayLabel.format(selectedDateObject)}</h2>
            </div>
            <span className="status-chip">{selectedTransactions.length}건</span>
          </div>

          <div className="calendar-day-summary">
            <div><span>수입</span><strong className="money-income">{money.format(selectedIncome)}</strong></div>
            <div><span>지출</span><strong className="money-expense">{money.format(selectedExpense)}</strong></div>
          </div>

          {mutationError ? <p role="alert" className="form-error">{mutationError}</p> : null}
          {lastDeletedId ? (
            <div className="settings-card-actions" role="status">
              <p>방금 삭제한 거래가 숨김 처리되었습니다.</p>
              <button type="button" className="text-button" disabled={mutationBusy} onClick={() => void restoreLastDeleted()}>
                삭제 취소
              </button>
            </div>
          ) : null}

          {selectedTransactions.length === 0 ? (
            <div className="calendar-empty-state">
              <strong>기록된 거래가 없습니다.</strong>
              <p>다른 날짜를 선택하거나 새 거래를 추가해보세요.</p>
            </div>
          ) : (
            <ul className="calendar-transaction-list">
              {selectedTransactions.map((transaction) => (
                <li key={transaction.id}>
                  {editingId === transaction.id ? (
                    <form className="page-stack calendar-edit-form" onSubmit={(event) => void submitEdit(event)}>
                      <label>
                        <span>내용</span>
                        <input
                          aria-label="거래 내용 수정"
                          maxLength={500}
                          value={editLabel}
                          onChange={(event) => setEditLabel(event.currentTarget.value)}
                        />
                      </label>
                      <label>
                        <span>금액</span>
                        <input
                          aria-label="거래 금액 수정"
                          inputMode="numeric"
                          value={editAmount}
                          onChange={(event) => setEditAmount(event.currentTarget.value.replace(/\D/g, ''))}
                        />
                      </label>
                      <label>
                        <span>일시</span>
                        <input
                          aria-label="거래 일시 수정"
                          type="datetime-local"
                          value={editOccurredAt}
                          onChange={(event) => setEditOccurredAt(event.currentTarget.value)}
                        />
                      </label>
                      <div className="calendar-toolbar-actions">
                        <button type="submit" className="primary-button" disabled={mutationBusy}>수정 저장</button>
                        <button type="button" className="text-button" disabled={mutationBusy} onClick={() => setEditingId(null)}>취소</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="calendar-transaction-main">
                        <strong>{transaction.label}</strong>
                        <span>{TYPE_LABELS[transaction.type] ?? transaction.type} · {timeLabel.format(new Date(transaction.occurredAt))}</span>
                      </div>
                      <strong className={`calendar-transaction-amount money-${transaction.direction}`}>
                        {signedAmount(transaction)}
                      </strong>
                      <div className="calendar-toolbar-actions">
                        <button type="button" className="text-button" onClick={() => startEdit(transaction)}>수정</button>
                        {deleteConfirmId === transaction.id ? (
                          <>
                            <button type="button" className="danger-button" disabled={mutationBusy} onClick={() => void confirmDelete(transaction.id)}>
                              삭제 확인
                            </button>
                            <button type="button" className="text-button" disabled={mutationBusy} onClick={() => setDeleteConfirmId(null)}>취소</button>
                          </>
                        ) : (
                          <button type="button" className="text-button" onClick={() => {
                            setEditingId(null);
                            setDeleteConfirmId(transaction.id);
                          }}>삭제</button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="secondary-button calendar-add-button" onClick={onQuickAdd}>새 거래 입력</button>
          <p className="calendar-help">삭제는 감사 이력을 남기는 소프트 삭제이며, 방금 삭제한 거래는 즉시 되돌릴 수 있습니다.</p>
        </aside>
      </div>
    </section>
  );
}

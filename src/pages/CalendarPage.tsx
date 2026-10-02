import { useMemo, useState } from 'react';
import type { TransactionSummaryViewModel } from '../app/ui-types';

interface CalendarPageProps {
  readonly transactions?: readonly TransactionSummaryViewModel[];
}

const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });

const TYPE_LABEL: Record<TransactionSummaryViewModel['type'], string> = {
  income: '수입',
  expense: '지출',
  transfer: '이체',
  saving: '저축',
  loan_payment: '대출 상환',
  investment_buy: '투자 매수',
  investment_sell: '투자 매도',
  adjustment: '조정',
};

export function CalendarPage({ transactions = [] }: CalendarPageProps) {
  const availableDates = useMemo(
    () => [...new Set(transactions.map((transaction) => transaction.occurredAt.slice(0, 10)))].sort().reverse(),
    [transactions],
  );
  const [selectedDate, setSelectedDate] = useState('');
  const effectiveDate = selectedDate || availableDates[0] || '';
  const selected = transactions.filter((transaction) => transaction.occurredAt.slice(0, 10) === effectiveDate);

  return (
    <section className="page-stack" aria-labelledby="calendar-title">
      <header className="page-header">
        <div><p className="eyebrow">CALENDAR</p><h1 id="calendar-title">캘린더</h1></div>
      </header>

      {availableDates.length === 0 ? (
        <article className="empty-panel">
          <strong>아직 기록된 거래가 없어요.</strong>
          <p>거래를 저장하면 날짜별 기록이 이곳에 표시됩니다.</p>
        </article>
      ) : (
        <>
          <label className="dashboard-card">
            <span className="card-label">조회 날짜</span>
            <select aria-label="조회 날짜" value={effectiveDate} onChange={(event) => setSelectedDate(event.currentTarget.value)}>
              {availableDates.map((date) => <option key={date} value={date}>{date}</option>)}
            </select>
          </label>
          <div className="page-stack" aria-label={`${effectiveDate} 거래 목록`}>
            {selected.map((transaction) => (
              <article className="dashboard-card" key={transaction.id}>
                <span className="card-label">{TYPE_LABEL[transaction.type]}</span>
                <strong>{won.format(transaction.amountMinor)}</strong>
                <p>{transaction.merchant || transaction.memo || '메모 없음'}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

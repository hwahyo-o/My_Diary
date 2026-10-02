import type { DashboardViewModel } from '../app/ui-types';

interface HomePageProps {
  readonly dashboard: DashboardViewModel;
  readonly onQuickAdd: () => void;
  readonly quickAddButtonRef?: React.Ref<HTMLButtonElement>;
}

const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });

export function HomePage({ dashboard, onQuickAdd, quickAddButtonRef }: HomePageProps) {
  return (
    <section className="page-stack" aria-labelledby="home-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">{dashboard.periodLabel}</p>
          <h1 id="home-title">안녕하세요, {dashboard.nickname || '사용자'}님</h1>
        </div>
        <button ref={quickAddButtonRef} type="button" className="primary-button" onClick={onQuickAdd}>거래 추가</button>
      </header>

      <section className="hero-balance" aria-label="기간 잔액">
        <span>현재 흐름</span>
        <strong>{won.format(dashboard.balanceMinor)}</strong>
        <div className="metric-row">
          <span>수입 {won.format(dashboard.incomeMinor)}</span>
          <span>지출 {won.format(dashboard.expenseMinor)}</span>
        </div>
      </section>

      <div className="dashboard-grid">
        <article className="dashboard-card">
          <span className="card-label">예산</span>
          <strong>{Math.round(dashboard.budget.usagePercent)}%</strong>
          <p>남은 예산 {won.format(dashboard.budget.remainingMinor)}</p>
          <span className={`status-pill status-${dashboard.budget.status}`}>{dashboard.budget.status}</span>
        </article>

        <article className="dashboard-card">
          <span className="card-label">리포트</span>
          <strong className="card-title">{dashboard.report.label}</strong>
          <p>{dashboard.report.status === 'ready' ? '확인할 준비가 됐어요.' : dashboard.report.status === 'stale' ? '새 데이터로 다시 생성이 필요해요.' : '데이터를 모으는 중이에요.'}</p>
        </article>

        <article className="dashboard-card">
          <span className="card-label">자주 간 곳</span>
          <strong className="card-title">{dashboard.topMerchant?.name ?? '아직 없어요'}</strong>
          <p>{dashboard.topMerchant ? won.format(dashboard.topMerchant.amountMinor) : '거래가 쌓이면 보여드릴게요.'}</p>
        </article>

        <article className="dashboard-card receipt-card">
          <span className="card-label">오늘의 영수증</span>
          <strong>{won.format(dashboard.todayReceipt.expenseMinor)}</strong>
          <p>{dashboard.todayReceipt.transactionCount}건의 지출</p>
        </article>
      </div>
    </section>
  );
}

import type { Ref } from 'react';
import type {
  AnalyticsViewModel,
  AssetsViewModel,
  CalendarViewModel,
  DashboardViewModel,
} from '../app/ui-types';

interface HomePageProps {
  readonly dashboard: DashboardViewModel;
  readonly analytics: AnalyticsViewModel;
  readonly assets: AssetsViewModel;
  readonly calendar: CalendarViewModel;
  readonly onQuickAdd: () => void;
  readonly quickAddButtonRef?: Ref<HTMLButtonElement>;
}

const won = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
});

const shortDate = new Intl.DateTimeFormat('ko-KR', {
  month: 'short',
  day: 'numeric',
});

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function budgetLabel(status: DashboardViewModel['budget']['status']): string {
  switch (status) {
    case 'over':
      return '예산 초과';
    case 'danger':
      return '예산 위험';
    case 'warning':
      return '예산 주의';
    default:
      return '예산 안정';
  }
}

function reportCopy(status: DashboardViewModel['report']['status']): string {
  if (status === 'ready') return '리포트 확인 가능';
  if (status === 'stale') return '리포트 재생성 필요';
  return '리포트 데이터 수집 중';
}

export function HomePage({
  dashboard,
  analytics,
  assets,
  calendar,
  onQuickAdd,
  quickAddButtonRef,
}: HomePageProps) {
  const flowMax = Math.max(dashboard.incomeMinor, dashboard.expenseMinor, 1);
  const incomeWidth = clampPercent((dashboard.incomeMinor / flowMax) * 100);
  const expenseWidth = clampPercent((dashboard.expenseMinor / flowMax) * 100);

  const spendMixTotal = analytics.fixedMinor + analytics.variableMinor + analytics.mixedMinor;
  const fixedPercent = spendMixTotal > 0 ? clampPercent((analytics.fixedMinor / spendMixTotal) * 100) : 0;
  const variablePercent = spendMixTotal > 0 ? clampPercent((analytics.variableMinor / spendMixTotal) * 100) : 0;
  const mixedPercent = spendMixTotal > 0 ? clampPercent((analytics.mixedMinor / spendMixTotal) * 100) : 0;

  const staleHoldingCount = assets.holdings.filter((holding) => holding.freshness === 'stale').length;
  const recentTransactions = calendar.transactions.slice(0, 5);
  const attentionItems = [
    dashboard.budget.status !== 'ok'
      ? { tone: dashboard.budget.status, title: budgetLabel(dashboard.budget.status), detail: `사용률 ${Math.round(dashboard.budget.usagePercent)}%` }
      : null,
    dashboard.report.status !== 'ready'
      ? { tone: 'info', title: reportCopy(dashboard.report.status), detail: dashboard.report.label }
      : null,
    staleHoldingCount > 0
      ? { tone: 'warning', title: '자산 평가 업데이트 필요', detail: `오래된 평가 ${staleHoldingCount}건` }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <section className="page-stack operational-home" aria-labelledby="home-title">
      <header className="page-header operational-home-header">
        <div>
          <p className="eyebrow">{dashboard.periodLabel} · OPERATIONAL DASHBOARD</p>
          <h1 id="home-title">{dashboard.nickname || '사용자'}님의 재무 운영 현황</h1>
          <p className="operational-home-lead">지금 확인해야 할 흐름과 다음 행동을 우선순위대로 보여줍니다.</p>
        </div>
        <button ref={quickAddButtonRef} type="button" className="primary-button" onClick={onQuickAdd}>거래 추가</button>
      </header>

      <section className="ops-hero-grid" aria-label="핵심 재무 운영 지표">
        <article className="ops-balance-card">
          <div className="ops-card-heading">
            <div>
              <span className="card-label">NET CASH FLOW</span>
              <h2>이번 달 순현금흐름</h2>
            </div>
            <span className={dashboard.balanceMinor >= 0 ? 'status-chip' : 'status-chip warning'}>
              {dashboard.balanceMinor >= 0 ? '흑자' : '적자'}
            </span>
          </div>
          <strong className={dashboard.balanceMinor >= 0 ? 'ops-balance-value positive' : 'ops-balance-value negative'}>
            {won.format(dashboard.balanceMinor)}
          </strong>
          <div className="ops-flow-bars" aria-label="수입과 지출 비교">
            <div>
              <div className="ops-flow-label"><span>수입</span><strong>{won.format(dashboard.incomeMinor)}</strong></div>
              <div className="ops-bar-track" aria-hidden="true">
                <span className="ops-bar-fill income" style={{ width: `${incomeWidth}%` }} />
              </div>
            </div>
            <div>
              <div className="ops-flow-label"><span>지출</span><strong>{won.format(dashboard.expenseMinor)}</strong></div>
              <div className="ops-bar-track" aria-hidden="true">
                <span className="ops-bar-fill expense" style={{ width: `${expenseWidth}%` }} />
              </div>
            </div>
          </div>
        </article>

        <article className="ops-attention-card">
          <div className="ops-card-heading">
            <div>
              <span className="card-label">ATTENTION</span>
              <h2>지금 확인할 것</h2>
            </div>
            <span className={attentionItems.length > 0 ? 'status-chip warning' : 'status-chip'}>
              {attentionItems.length > 0 ? `${attentionItems.length}개` : '양호'}
            </span>
          </div>
          {attentionItems.length === 0 ? (
            <div className="ops-all-clear">
              <strong>현재 우선 조치가 없습니다.</strong>
              <p>예산, 리포트, 자산 평가 상태가 안정적입니다.</p>
            </div>
          ) : (
            <ul className="ops-attention-list">
              {attentionItems.map((item) => (
                <li key={item.title} data-tone={item.tone}>
                  <span className="ops-attention-dot" aria-hidden="true" />
                  <div><strong>{item.title}</strong><span>{item.detail}</span></div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="ops-kpi-grid" aria-label="핵심 운영 KPI">
        <article className="ops-kpi-card">
          <span className="card-label">BUDGET</span>
          <div className="ops-kpi-row">
            <strong>{Math.round(dashboard.budget.usagePercent)}%</strong>
            <span className={`status-pill status-${dashboard.budget.status}`}>{budgetLabel(dashboard.budget.status)}</span>
          </div>
          <div
            className="ops-budget-progress"
            role="progressbar"
            aria-label="예산 사용률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clampPercent(dashboard.budget.usagePercent))}
          >
            <span style={{ width: `${clampPercent(dashboard.budget.usagePercent)}%` }} />
          </div>
          <p>남은 예산 {won.format(dashboard.budget.remainingMinor)}</p>
        </article>

        <article className="ops-kpi-card">
          <span className="card-label">NET WORTH</span>
          <strong>{won.format(assets.netWorthMinor)}</strong>
          <p>{assets.valuationLabel}</p>
        </article>

        <article className="ops-kpi-card">
          <span className="card-label">TODAY</span>
          <strong>{won.format(dashboard.todayReceipt.expenseMinor)}</strong>
          <p>오늘 지출 {dashboard.todayReceipt.transactionCount}건</p>
        </article>

        <article className="ops-kpi-card">
          <span className="card-label">TOP MERCHANT</span>
          <strong className="ops-kpi-title">{dashboard.topMerchant?.name ?? '아직 없음'}</strong>
          <p>{dashboard.topMerchant ? won.format(dashboard.topMerchant.amountMinor) : '거래가 쌓이면 표시됩니다.'}</p>
        </article>
      </section>

      <section className="ops-content-grid">
        <article className="ops-panel" aria-labelledby="spend-mix-title">
          <div className="ops-card-heading">
            <div>
              <span className="card-label">SPENDING MIX</span>
              <h2 id="spend-mix-title">지출 구조</h2>
            </div>
            <strong>{won.format(spendMixTotal)}</strong>
          </div>

          <div
            className="ops-stacked-bar"
            aria-label={`고정 ${Math.round(fixedPercent)}%, 변동 ${Math.round(variablePercent)}%, 혼합 ${Math.round(mixedPercent)}%`}
          >
            <span className="fixed" style={{ width: `${fixedPercent}%` }} />
            <span className="variable" style={{ width: `${variablePercent}%` }} />
            <span className="mixed" style={{ width: `${mixedPercent}%` }} />
          </div>

          <dl className="ops-mix-legend">
            <div><dt><span className="legend-dot fixed" />고정</dt><dd>{won.format(analytics.fixedMinor)}</dd></div>
            <div><dt><span className="legend-dot variable" />변동</dt><dd>{won.format(analytics.variableMinor)}</dd></div>
            <div><dt><span className="legend-dot mixed" />혼합</dt><dd>{won.format(analytics.mixedMinor)}</dd></div>
          </dl>
        </article>

        <article className="ops-panel" aria-labelledby="report-title">
          <div className="ops-card-heading">
            <div>
              <span className="card-label">REPORT STATUS</span>
              <h2 id="report-title">{dashboard.report.label}</h2>
            </div>
            <span className={dashboard.report.status === 'ready' ? 'status-chip' : 'status-chip warning'}>
              {dashboard.report.status}
            </span>
          </div>
          <p className="ops-panel-copy">{reportCopy(dashboard.report.status)}</p>
          <div className="ops-report-meta">
            <span>분석 리포트 {analytics.reports.length}개</span>
            <span>계좌 {assets.accounts.length}개</span>
            <span>보유 종목 {assets.holdings.length}개</span>
          </div>
        </article>
      </section>

      <section className="ops-panel" aria-labelledby="recent-activity-title">
        <div className="ops-card-heading">
          <div>
            <span className="card-label">RECENT ACTIVITY</span>
            <h2 id="recent-activity-title">최근 거래</h2>
          </div>
          <span className="status-chip">{calendar.transactions.length}건 기록</span>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="ops-empty">
            <strong>아직 거래가 없습니다.</strong>
            <p>첫 거래를 입력하면 최근 활동이 여기에 표시됩니다.</p>
          </div>
        ) : (
          <ul className="ops-recent-list">
            {recentTransactions.map((transaction) => (
              <li key={transaction.id}>
                <div className="ops-recent-main">
                  <strong>{transaction.label}</strong>
                  <span>{shortDate.format(new Date(transaction.occurredAt))} · {transaction.type}</span>
                </div>
                <strong className={`money-${transaction.direction}`}>
                  {transaction.direction === 'income' ? '+' : transaction.direction === 'expense' ? '-' : ''}
                  {won.format(transaction.amountMinor)}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

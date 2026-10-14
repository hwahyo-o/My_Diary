import { useState, type FormEvent } from 'react';
import type { AnalyticsViewModel, BudgetSummaryViewModel } from '../app/ui-types';

interface StatsPageProps {
  readonly incomeMinor?: number;
  readonly expenseMinor?: number;
  readonly budget?: BudgetSummaryViewModel;
  readonly analytics?: AnalyticsViewModel;
  readonly onSaveBudget?: (input: { readonly limitMinor: number }) => Promise<void>;
}

const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });
const reportLabels = {
  month_start: '월초 리포트',
  month_end: '월말 리포트',
  half_year: '반기 리포트',
  year_end: '연말 리포트',
} as const;

export function StatsPage({
  incomeMinor = 0,
  expenseMinor = 0,
  budget = { limitMinor: 0, usagePercent: 0, remainingMinor: 0, status: 'ok' },
  analytics = { fixedMinor: 0, variableMinor: 0, mixedMinor: 0, reports: [] },
  onSaveBudget,
}: StatsPageProps) {
  const [budgetInput, setBudgetInput] = useState(String(budget.limitMinor || ''));

  const submitBudget = (event: FormEvent) => {
    event.preventDefault();
    if (!onSaveBudget) return;
    const limitMinor = Number(budgetInput);
    if (!Number.isSafeInteger(limitMinor) || limitMinor < 0) return;
    void onSaveBudget({ limitMinor });
  };

  return (
    <section className="page-stack" aria-labelledby="stats-title">
      <header className="page-header"><div><p className="eyebrow">ANALYTICS</p><h1 id="stats-title">통계</h1></div></header>
      <div className="dashboard-grid" aria-label="기간 통계 텍스트 요약">
        <article className="dashboard-card"><span className="card-label">수입</span><strong>{won.format(incomeMinor)}</strong></article>
        <article className="dashboard-card"><span className="card-label">지출</span><strong>{won.format(expenseMinor)}</strong></article>
        <article className="dashboard-card"><span className="card-label">고정 지출</span><strong>{won.format(analytics.fixedMinor)}</strong></article>
        <article className="dashboard-card"><span className="card-label">변동 지출</span><strong>{won.format(analytics.variableMinor)}</strong></article>
      </div>

      {analytics.classificationCoverage ? (
        <article className="dashboard-card" aria-labelledby="classification-coverage-title">
          <h2 id="classification-coverage-title">빠른 입력 분류 현황</h2>
          <p>카테고리 지정률 {analytics.classificationCoverage.coveragePercent}% · 분류됨 {analytics.classificationCoverage.categorizedQuickCount}건 / 전체 {analytics.classificationCoverage.totalQuickCount}건</p>
          <p>미분류 {analytics.classificationCoverage.uncategorizedQuickCount}건 · 누적 수동 카테고리 수정 근거 {analytics.classificationCoverage.correctionObservations}회 · 미승인 규칙 제안 {analytics.classificationCoverage.pendingSuggestionCount}건</p>
          <p className="assistive-copy">카테고리가 저장된 거래의 비율입니다. 자동분류 정답률과는 다르며, 기존 기록에서는 수정 내역 전체를 복원할 수 없습니다.</p>
        </article>
      ) : null}

      <article className="dashboard-card">
        <h2>월 예산</h2>
        <p>{Math.round(budget.usagePercent)}% 사용 · {won.format(budget.remainingMinor)} 남음</p>
        <form onSubmit={submitBudget}>
          <label htmlFor="monthly-budget">월 예산</label>
          <input id="monthly-budget" inputMode="numeric" value={budgetInput} onChange={(event) => setBudgetInput(event.target.value)} />
          <button type="submit" disabled={!onSaveBudget}>예산 저장</button>
        </form>
      </article>

      <section className="page-stack" aria-labelledby="reports-title">
        <h2 id="reports-title">기본 리포트</h2>
        {analytics.reports.length === 0 ? (
          <p className="assistive-copy">거래가 저장되면 리포트가 생성됩니다.</p>
        ) : (
          analytics.reports.map((report) => (
            <article className="dashboard-card" key={report.type}>
              <strong>{reportLabels[report.type]}</strong>
              <p>{report.periodStart} ~ {report.periodEnd}</p>
              <p>신뢰도 {report.confidence} · 수입 {won.format(report.incomeMinor)} · 지출 {won.format(report.expenseMinor)}</p>
            </article>
          ))
        )}
      </section>
      <p className="assistive-copy">모든 수치는 로컬 Vault의 복호화된 데이터에서 계산되며 차트 없이도 텍스트로 확인할 수 있습니다.</p>
    </section>
  );
}

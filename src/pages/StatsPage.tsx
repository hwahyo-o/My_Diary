interface StatsPageProps {
  readonly incomeMinor?: number;
  readonly expenseMinor?: number;
  readonly fixedMinor?: number;
  readonly variableMinor?: number;
}

const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });

export function StatsPage({ incomeMinor = 0, expenseMinor = 0, fixedMinor = 0, variableMinor = 0 }: StatsPageProps) {
  return (
    <section className="page-stack" aria-labelledby="stats-title">
      <header className="page-header"><div><p className="eyebrow">ANALYTICS</p><h1 id="stats-title">통계</h1></div></header>
      <div className="dashboard-grid" aria-label="기간 통계 텍스트 요약">
        <article className="dashboard-card"><span className="card-label">수입</span><strong>{won.format(incomeMinor)}</strong></article>
        <article className="dashboard-card"><span className="card-label">지출</span><strong>{won.format(expenseMinor)}</strong></article>
        <article className="dashboard-card"><span className="card-label">고정 지출</span><strong>{won.format(fixedMinor)}</strong></article>
        <article className="dashboard-card"><span className="card-label">변동 지출</span><strong>{won.format(variableMinor)}</strong></article>
      </div>
      <p className="assistive-copy">차트가 추가되더라도 동일한 수치를 텍스트로 함께 제공합니다.</p>
    </section>
  );
}

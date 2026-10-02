interface AssetsPageProps {
  readonly netWorthMinor?: number;
  readonly valuationLabel?: string;
}

const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });

export function AssetsPage({ netWorthMinor = 0, valuationLabel = '평가 정보 없음' }: AssetsPageProps) {
  return (
    <section className="page-stack" aria-labelledby="assets-title">
      <header className="page-header"><div><p className="eyebrow">NET WORTH</p><h1 id="assets-title">자산</h1></div></header>
      <article className="hero-balance">
        <span>순자산</span>
        <strong>{won.format(netWorthMinor)}</strong>
        <p className="valuation-note">{valuationLabel}</p>
      </article>
      <article className="empty-panel"><strong>계좌 · 저축 · 대출 · 투자</strong><p>각 항목은 이후 실제 저장 데이터와 selector 결과에 연결됩니다.</p></article>
    </section>
  );
}

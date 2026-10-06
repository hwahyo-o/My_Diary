export function CalendarPage() {
  return (
    <section className="page-stack" aria-labelledby="calendar-title">
      <header className="page-header"><div><p className="eyebrow">LEDGER</p><h1 id="calendar-title">캘린더</h1></div></header>
      <article className="empty-panel">
        <strong>날짜별 거래</strong>
        <p>월간 달력과 선택한 날짜의 거래 목록이 이 영역에 연결됩니다.</p>
      </article>
    </section>
  );
}

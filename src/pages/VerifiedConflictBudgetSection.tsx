import { useState } from 'react';
import type { BudgetConflictComparison } from '../app/runtime/verified-budget-conflict-comparison';

export function VerifiedConflictBudgetSection({ onPreview }: {
  readonly onPreview: () => Promise<BudgetConflictComparison>;
}) {
  const [result, setResult] = useState<BudgetConflictComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function preview() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setError(false);
    try {
      setResult(await onPreview());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="settings-card" aria-label="검증된 충돌 예산 비교">
      <h2>충돌한 예산 비교</h2>
      <p>Vault 잠금 해제 상태에서 확인된 기록만 표시합니다. 조회만 가능하며 기록은 변경되지 않습니다.</p>
      <button type="button" disabled={busy} onClick={() => void preview()}>
        {busy ? '검증 중…' : '충돌 예산 비교 조회'}
      </button>
      {error && <p role="alert">비교할 수 없습니다. 연결·잠금·데이터 변경 상태를 확인한 뒤 다시 조회해 주세요.</p>}
      {result && <div aria-label="충돌 예산 비교 결과">
        {result.candidates.length === 0 ? <p>비교 가능한 예산 기록이 없습니다.</p> : result.candidates.map((item) =>
          <section key={item.recordId}>
            <p>대상 월: {item.month}</p>
            <p>로컬 예산: {item.localLimitMinor.toLocaleString('ko-KR')}원</p>
            <p>클라우드 예산: {item.remoteLimitMinor.toLocaleString('ko-KR')}원</p>
          </section>)}
        <p>별도 검토가 필요한 기록 {result.unresolvedNonBudgetRecordCount}개 · 이벤트 {result.unresolvedEventCount}개</p>
        <p>현재 선택 및 확정 기능은 제공하지 않습니다.</p>
      </div>}
    </article>
  );
}

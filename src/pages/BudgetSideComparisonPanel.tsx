import type { BudgetSideComparison } from '../app/runtime/budget-side-comparison';

interface Props {
  readonly comparison: BudgetSideComparison;
}
function amount(value: number | null): string {
  return value === null ? '기록 없음' : `${value.toLocaleString('ko-KR')}원`;
}
/**
 * Read-only presentation of an already authenticated and decrypted comparison.
 * Parent is responsible for verified cloud snapshot identity and Vault unlock.
 * Never sends budget contents or provides an automatic conflict resolution action.
 */
export function BudgetSideComparisonPanel({ comparison }: Props) {
  return (
    <section aria-labelledby="budget-comparison-title">
      <h2 id="budget-comparison-title">로컬·클라우드 예산 비교</h2>
      <p>이 화면은 검토 전용이며 어느 기록도 덮어쓰지 않습니다.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem' }}>
        <article aria-label="로컬 예산">
          <h3>내 기기</h3>
          <p>최근 예산: {amount(comparison.local.latestLimitMinor)}</p>
          <p>보유 기록: {comparison.local.recordIds.length}개</p>
        </article>
        <article aria-label="클라우드 예산">
          <h3>클라우드</h3>
          <p>최근 예산: {amount(comparison.remote.latestLimitMinor)}</p>
          <p>보유 기록: {comparison.remote.recordIds.length}개</p>
        </article>
      </div>
      {comparison.requiresReview ? (
        <p role="status">기록 또는 변경 이력에 차이가 있습니다. 실제 동시 수정 충돌 여부는 추가 검증이 필요합니다.</p>
      ) : (
        <p role="status">비교한 예산 기록 ID와 최신 금액이 일치합니다.</p>
      )}
      <p>이 비교만으로 최종 예산을 선택하거나 클라우드에 업로드하지 않습니다.</p>
    </section>
  );
}

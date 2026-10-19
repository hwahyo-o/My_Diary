import { useState } from 'react';
import type { BudgetSideComparison } from '../app/runtime/budget-side-comparison';
import { BudgetSideComparisonPanel } from './BudgetSideComparisonPanel';

interface Props {
  readonly onPreview: () => Promise<BudgetSideComparison>;
}

export function CloudBudgetPreviewSection({ onPreview }: Props) {
  const [result, setResult] = useState<BudgetSideComparison | null>(null);
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
    <article className="settings-card" aria-label="클라우드 예산 비교 조회">
      <p>연결된 클라우드 Vault의 예산을 읽기 전용으로 비교합니다. 기록을 저장하거나 덮어쓰지 않습니다.</p>
      <button type="button" disabled={busy} onClick={() => void preview()}>
        {busy ? '비교 확인 중…' : '클라우드 예산 비교 조회'}
      </button>
      {error ? <p className="form-error" role="alert">비교 자료를 확인하지 못했습니다. 잠금·연결 상태를 확인하고 다시 조회해주세요.</p> : null}
      {result ? <BudgetSideComparisonPanel comparison={result} /> : null}
    </article>
  );
}

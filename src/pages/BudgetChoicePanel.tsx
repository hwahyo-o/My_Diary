import { useState } from 'react';

export interface BudgetChoiceItem {
  readonly id: string;
  readonly updatedAt: string;
  readonly limitMinor: number;
}

interface BudgetChoicePanelProps {
  readonly cloudConflict: boolean;
  readonly onList: () => Promise<readonly BudgetChoiceItem[]>;
  readonly onConfirm: (id: string) => Promise<void>;
}

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

export function BudgetChoicePanel({ onList, onConfirm, cloudConflict }: BudgetChoicePanelProps) {
  const [items, setItems] = useState<readonly BudgetChoiceItem[] | null>(null);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setSuccess(false);
    setSelected('');
    setItems(null);
    try {
      setItems(await onList());
    } catch {
      setError('예산 기록을 불러오지 못했습니다. Vault 잠금 상태를 확인하고 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!selected || saving || loading || cloudConflict) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await onConfirm(selected);
      const latest = await onList();
      setItems(latest);
      setSelected('');
      setSuccess(true);
    } catch {
      setItems(null);
      setSelected('');
      setError('예산 확정에 실패했습니다. 변경된 기록이 있을 수 있으므로 다시 조회 후 선택해주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="settings-card" aria-labelledby="budget-history-title">
      <div className="settings-card-heading">
        <div>
          <p className="card-kicker">BUDGET HISTORY</p>
          <h2 id="budget-history-title">이번 달 예산 기록 선택</h2>
          <p>이전 예산 중 하나를 선택하여 다시 적용할 수 있습니다. 기존 기록은 삭제되지 않습니다.</p>
        </div>
      </div>
      <div className="settings-card-actions">
        <button type="button" disabled={loading || saving} onClick={() => void load()}>
          {loading ? '예산 불러오는 중…' : '이번 달 예산 기록 조회'}
        </button>
        {items && items.length === 0 ? <p>이번 달에 저장된 예산 기록이 없습니다.</p> : null}
        {items && items.length > 1 && items.some((item) => item.limitMinor !== items[0]?.limitMinor) ? (
          <p role="note">이번 달에 서로 다른 예산 금액의 변경 이력이 있습니다. 정상적인 순차 수정일 수도 있으므로 이 사실만으로 기기 간 충돌이라고 판단하지 않습니다.</p>
        ) : null}
        {items && items.length > 0 ? (
          <fieldset disabled={loading || saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend>적용할 예산 기록을 선택해주세요</legend>
            <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.5rem' }}>
              {items.map((item, index) => (
                <label key={item.id} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', overflowWrap: 'anywhere' }}>
                  <input
                    type="radio"
                    name="budget-candidate"
                    value={item.id}
                    checked={selected === item.id}
                    onChange={() => { setSelected(item.id); setSuccess(false); }}
                  />
                  <span>
                    <strong>{item.limitMinor.toLocaleString('ko-KR')}원</strong>
                    {index === 0 ? ' · 현재 적용된 기록' : ' · 이전 기록'}
                    <small style={{ display: 'block' }}>저장: {displayDate(item.updatedAt)}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {cloudConflict ? <p role="alert" className="form-error">클라우드 기록 충돌이 있어 예산 확정을 중지했습니다. 이 화면에서 충돌을 해결할 수는 없습니다. 로컬 기록은 보존됩니다.</p> : null}
        {selected ? <p>선택한 금액을 새 예산 기록으로 저장합니다. 기존 기록과 거래 내역은 그대로 유지됩니다.</p> : null}
        <button type="button" disabled={!selected || loading || saving || cloudConflict} onClick={() => void confirm()}>
          {saving ? '예산 확정 중…' : '선택한 예산 적용'}
        </button>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {success ? <p role="status">예산 기록이 저장되었습니다. 이전 기록은 보존됩니다.</p> : null}
        <p className="settings-footnote">참고: 이 기능은 예산 변경 이력을 선택하는 도구이며, 서로 다른 기기의 동시 수정 충돌을 자동으로 해결하지 않습니다.</p>
      </div>
    </article>
  );
}

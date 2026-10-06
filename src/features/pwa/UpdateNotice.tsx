interface UpdateNoticeProps {
  readonly open: boolean;
  readonly onApply: () => void;
  readonly onDismiss: () => void;
}

export function UpdateNotice({ open, onApply, onDismiss }: UpdateNoticeProps) {
  if (!open) return null;

  return (
    <aside className="update-notice" role="status" aria-live="polite" aria-label="새 버전 업데이트">
      <div>
        <strong>새 버전을 사용할 수 있어요.</strong>
        <p>현재 입력을 마친 뒤 업데이트하면 앱을 새 버전으로 다시 엽니다.</p>
      </div>
      <div className="button-row">
        <button type="button" className="primary-button" onClick={onApply}>업데이트 적용</button>
        <button type="button" className="secondary-button" onClick={onDismiss}>나중에</button>
      </div>
    </aside>
  );
}

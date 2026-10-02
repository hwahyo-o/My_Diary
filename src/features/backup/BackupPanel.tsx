import { useEffect, useState } from 'react';
import { makeVaultFilename, readVaultFile } from '../../app/runtime/browser-file-io';
import type { BackupStatusViewModel, VaultImportInspectionViewModel } from '../../app/ui-types';
import { deriveBackupStatus, readBackupStatus, writeBackupExportedAt } from './backup-status';

interface BackupPanelProps {
  readonly backup: BackupStatusViewModel;
  readonly onExport: (input: { readonly recoveryKey: string }) => Promise<Uint8Array>;
  readonly onInspectImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<VaultImportInspectionViewModel>;
  readonly onApplyImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<void>;
  readonly onDownload: (bytes: Uint8Array, filename: string) => void;
}

export function BackupPanel({ backup, onExport, onInspectImport, onApplyImport, onDownload }: BackupPanelProps) {
  const [status, setStatus] = useState<BackupStatusViewModel>(() => backup.lastExportedAt ? backup : readBackupStatus());
  const [exportKey, setExportKey] = useState('');
  const [importKey, setImportKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<VaultImportInspectionViewModel | null>(null);
  const [pendingBytes, setPendingBytes] = useState<Uint8Array | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    setExportKey('');
    setImportKey('');
  }, []);

  function clearSensitive() {
    setExportKey('');
    setImportKey('');
    setInspection(null);
    setPendingBytes(null);
    setFile(null);
  }

  async function handleExport() {
    setMessage(null);
    if (!exportKey.trim()) {
      setMessage('RecoveryKey를 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const bytes = await onExport({ recoveryKey: exportKey.trim() });
      onDownload(bytes, makeVaultFilename());
      const exportedAt = new Date().toISOString();
      writeBackupExportedAt(exportedAt);
      setStatus(deriveBackupStatus(exportedAt));
      setMessage('최근 내보내기: 방금 생성됨');
      setExportKey('');
    } catch {
      setMessage('백업을 내보내지 못했습니다. RecoveryKey를 확인해주세요.');
      setExportKey('');
    } finally {
      setBusy(false);
    }
  }

  async function handleInspect() {
    setMessage(null);
    setInspection(null);
    setPendingBytes(null);
    if (!file || !importKey.trim()) {
      setMessage('Vault 파일과 RecoveryKey를 모두 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const bytes = await readVaultFile(file);
      const result = await onInspectImport(bytes, { recoveryKey: importKey.trim() });
      setPendingBytes(bytes);
      setInspection(result);
    } catch {
      setMessage('가져오기 검증에 실패했습니다. 파일과 RecoveryKey를 확인해주세요.');
      setImportKey('');
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    if (!pendingBytes || !inspection || !importKey.trim()) return;
    setBusy(true);
    try {
      await onApplyImport(pendingBytes, { recoveryKey: importKey.trim() });
      setMessage('Vault 가져오기가 완료되었습니다.');
      clearSensitive();
    } catch {
      setMessage('Vault 가져오기를 적용하지 못했습니다. 변경사항은 적용되지 않았습니다.');
      setImportKey('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="backup-panel" aria-labelledby="backup-title">
      <div className="settings-section-header">
        <div>
          <p className="eyebrow">ENCRYPTED VAULT</p>
          <h2 id="backup-title">백업 및 복구</h2>
        </div>
        <span className={status.reminderDue ? 'status-chip warning' : 'status-chip'}>
          {status.reminderDue ? '백업 권장' : '백업 양호'}
        </span>
      </div>
      <p className="settings-help">
        {status.lastExportedAt ? `마지막 내보내기 ${status.lastExportedAt}` : '아직 내보낸 백업이 없습니다.'}
      </p>

      <div className="backup-grid">
        <div className="backup-card">
          <h3>암호화 백업 내보내기</h3>
          <p>RecoveryKey로 인증한 뒤 암호화된 .vault 파일을 생성합니다.</p>
          <label>
            <span>RecoveryKey</span>
            <input aria-label="RecoveryKey" type="password" autoComplete="off" value={exportKey} onChange={(event) => setExportKey(event.currentTarget.value)} />
          </label>
          <button type="button" className="primary-button" disabled={busy} onClick={handleExport}>백업 내보내기</button>
        </div>

        <div className="backup-card">
          <h3>백업 가져오기</h3>
          <p>파일을 먼저 검사하고 차이를 확인한 뒤에만 적용할 수 있습니다.</p>
          <label>
            <span>Vault 파일</span>
            <input aria-label="Vault 파일" type="file" accept=".vault,application/octet-stream" onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)} />
          </label>
          <label>
            <span>RecoveryKey</span>
            <input aria-label="가져오기 RecoveryKey" type="password" autoComplete="off" value={importKey} onChange={(event) => setImportKey(event.currentTarget.value)} />
          </label>
          <button type="button" className="secondary-button" disabled={busy} onClick={handleInspect}>가져오기 검사</button>
        </div>
      </div>

      {inspection ? (
        <div className="import-diff" aria-live="polite">
          <h3>적용 전 변경사항</h3>
          <div className="metric-row">
            <span>신규 {inspection.newRecords}</span>
            <span>업데이트 {inspection.updatedRecords}</span>
            <span>동일 {inspection.sameRecords}</span>
            <span>로컬 전용 {inspection.localOnlyRecords}</span>
            <span>충돌 {inspection.conflicts}</span>
          </div>
          <button type="button" className="danger-button" disabled={busy || inspection.conflicts > 0 || inspection.localOnlyRecords > 0} onClick={handleApply}>
            이 변경사항 적용
          </button>
        </div>
      ) : null}

      {message ? <p role="status" className="settings-message">{message}</p> : null}
      <button type="button" className="text-button" onClick={clearSensitive}>백업 작업 취소</button>
    </section>
  );
}

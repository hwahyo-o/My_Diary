import { useEffect, useState } from 'react';
import { makeVaultFilename, readVaultFile } from '../../app/runtime/browser-file-io';
import type { BackupStatusViewModel, VaultImportInspectionViewModel } from '../../app/ui-types';
import { deriveBackupStatus, formatBackupDateKst, readBackupStatus, writeBackupExportedAt } from './backup-status';
import { listLocalBackups, readLocalBackup, saveLocalBackup, type LocalBackupSummary } from './backup-archive';

interface BackupPanelProps {
  readonly backup: BackupStatusViewModel;
  readonly onExport: (input: { readonly recoveryKey: string }) => Promise<Uint8Array>;
  readonly onInspectImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<VaultImportInspectionViewModel>;
  readonly onApplyImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<void>;
  readonly onDownload: (bytes: Uint8Array, filename: string) => void;
  readonly onBackupExported?: (exportedAt: string) => void;
}

export function BackupPanel({ backup, onExport, onInspectImport, onApplyImport, onDownload, onBackupExported }: BackupPanelProps) {
  const [status, setStatus] = useState<BackupStatusViewModel>(() => backup.lastExportedAt ? backup : readBackupStatus());
  const [archives, setArchives] = useState<LocalBackupSummary[]>([]);
  const [exportKey, setExportKey] = useState('');
  const [importKey, setImportKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<VaultImportInspectionViewModel | null>(null);
  const [pendingBytes, setPendingBytes] = useState<Uint8Array | null>(null);
  const [selectedArchiveName, setSelectedArchiveName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshArchives();
    return () => {
      setExportKey('');
      setImportKey('');
    };
  }, []);

  async function refreshArchives() {
    try {
      setArchives(await listLocalBackups());
    } catch {
      setMessage('이 브라우저의 백업 보관함을 읽지 못했습니다. 내려받은 .vault 파일을 별도 위치에 보관해주세요.');
    }
  }

  function clearSensitive() {
    setExportKey('');
    setImportKey('');
    setInspection(null);
    setPendingBytes(null);
    setSelectedArchiveName(null);
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
      const filename = makeVaultFilename();
      const exportedAt = new Date().toISOString();
      let archived = false;
      try {
        await saveLocalBackup(bytes, filename, exportedAt);
        archived = true;
      } catch {
        // Still download the encrypted backup if this browser cannot persist it.
      }
      onDownload(bytes, filename);
      writeBackupExportedAt(exportedAt);
      setStatus(deriveBackupStatus(exportedAt));
      onBackupExported?.(exportedAt);
      await refreshArchives();
      setMessage(archived
        ? '최근 내보내기: 방금 생성됨 · 이 브라우저의 백업 목록에도 저장했습니다.'
        : '최근 내보내기: 방금 생성됨 · 브라우저 보관에 실패해 파일을 안전한 위치에 보관해주세요.');
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
    if (!pendingBytes && !file) {
      setMessage('Vault 파일 또는 백업 목록에서 파일을 선택하고 RecoveryKey를 입력해주세요.');
      return;
    }
    if (!importKey.trim()) {
      setMessage('RecoveryKey를 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const bytes = pendingBytes ?? await readVaultFile(file!);
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

  async function selectArchive(id: string) {
    setMessage(null);
    setInspection(null);
    setBusy(true);
    try {
      const archived = await readLocalBackup(id);
      setPendingBytes(archived.bytes);
      setSelectedArchiveName(archived.summary.filename);
      setFile(null);
      setMessage('복원할 백업을 선택했습니다. RecoveryKey를 입력하고 가져오기 검사를 눌러주세요.');
    } catch {
      setMessage('선택한 백업을 읽지 못했습니다. 내려받은 .vault 파일을 사용해주세요.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadArchive(id: string) {
    setMessage(null);
    setBusy(true);
    try {
      const archived = await readLocalBackup(id);
      onDownload(archived.bytes, archived.summary.filename);
      setMessage('백업 파일을 다시 내려받았습니다.');
    } catch {
      setMessage('백업을 다시 내려받지 못했습니다. 브라우저 저장 공간을 확인해주세요.');
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
        {status.lastExportedAt ? `마지막 내보내기 ${formatBackupDateKst(status.lastExportedAt)}` : '아직 내보낸 백업이 없습니다.'}
      </p>

      <div className="backup-grid">
        <div className="backup-card">
          <h3>암호화 백업 내보내기</h3>
          <p>RecoveryKey로 인증한 뒤 암호화된 .vault 파일을 만듭니다.</p>
          <label>
            <span>내보내기 RecoveryKey</span>
            <input aria-label="내보내기 RecoveryKey" type="password" autoComplete="off" value={exportKey} onChange={(event) => setExportKey(event.currentTarget.value)} />
          </label>
          <button type="button" className="primary-button" disabled={busy} onClick={handleExport}>백업 내보내기</button>
        </div>

        <div className="backup-card">
          <h3>백업 가져오기</h3>
          <p>파일을 검사하고 차이를 확인한 뒤에만 복원합니다.</p>
          <label>
            <span>Vault 파일</span>
            <input aria-label="Vault 파일" type="file" accept=".vault,application/octet-stream" onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setPendingBytes(null);
              setSelectedArchiveName(null);
              setInspection(null);
            }} />
          </label>
          <label>
            <span>가져오기 RecoveryKey</span>
            <input aria-label="가져오기 RecoveryKey" type="password" autoComplete="off" value={importKey} onChange={(event) => setImportKey(event.currentTarget.value)} />
          </label>
          {selectedArchiveName ? <p className="settings-help">선택한 백업: {selectedArchiveName}</p> : null}
          <button type="button" className="secondary-button" disabled={busy} onClick={handleInspect}>가져오기 검사</button>
        </div>
      </div>

      <section className="backup-archive" aria-labelledby="backup-archive-title">
        <h3 id="backup-archive-title">이 브라우저의 백업 목록</h3>
        <p className="settings-help">백업 파일은 이 브라우저에 암호화된 상태로 보관됩니다. 브라우저 저장 공간을 지우면 목록도 사라질 수 있으니 중요한 파일은 별도 위치에도 보관해주세요.</p>
        {archives.length ? (
          <ul>
            {archives.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.filename}</strong>
                  <span>{formatBackupDateKst(item.exportedAt)} · {(item.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <button type="button" className="secondary-button" disabled={busy} onClick={() => void handleDownloadArchive(item.id)}>다시 다운로드</button>
                <button type="button" className="text-button" disabled={busy} onClick={() => void selectArchive(item.id)}>복원에 사용</button>
              </li>
            ))}
          </ul>
        ) : <p className="settings-help">저장된 백업이 없습니다. 백업 내보내기를 실행하면 이 목록에 추가됩니다.</p>}
      </section>

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

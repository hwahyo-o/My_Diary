import { useState } from 'react';
import type { BackupStatusViewModel, VaultImportInspectionViewModel } from '../app/ui-types';
import { BackupPanel } from '../features/backup/BackupPanel';

interface SettingsPageProps {
  readonly onLock: () => void;
  readonly backup: BackupStatusViewModel;
  readonly onExportVault: (input: { readonly recoveryKey: string }) => Promise<Uint8Array>;
  readonly onInspectVaultImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<VaultImportInspectionViewModel>;
  readonly onApplyVaultImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<void>;
  readonly onDownloadVault: (bytes: Uint8Array, filename: string) => void;
}

export function SettingsPage({
  onLock,
  backup,
  onExportVault,
  onInspectVaultImport,
  onApplyVaultImport,
  onDownloadVault,
}: SettingsPageProps) {
  const [backupOpen, setBackupOpen] = useState(false);

  return (
    <section className="page-stack" aria-labelledby="settings-title">
      <header className="page-header"><div><p className="eyebrow">PREFERENCES</p><h1 id="settings-title">설정</h1></div></header>
      <div className="settings-list">
        <button type="button" className="settings-row"><span>보안</span><small>PIN · 잠금 · 기기</small></button>
        <button type="button" className="settings-row" aria-expanded={backupOpen} onClick={() => setBackupOpen((value) => !value)}>
          <span>백업 및 복구</span><small>암호화 Vault 내보내기 · 가져오기</small>
        </button>
        {backupOpen ? (
          <BackupPanel
            backup={backup}
            onExport={onExportVault}
            onInspectImport={onInspectVaultImport}
            onApplyImport={onApplyVaultImport}
            onDownload={onDownloadVault}
          />
        ) : null}
        <button type="button" className="settings-row"><span>분류 규칙</span><small>카테고리 자동 분류 후보</small></button>
        <button type="button" className="settings-row"><span>표시 설정</span><small>금액 표시 · 화면 옵션</small></button>
        <button type="button" className="settings-row settings-lock" aria-label="지금 잠그기" onClick={onLock}><span>지금 잠그기</span><small>복호화된 세션 정보를 즉시 지웁니다.</small></button>
      </div>
    </section>
  );
}

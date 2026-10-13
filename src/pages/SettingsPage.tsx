import { useState } from 'react';
import type { BackupStatusViewModel, VaultImportInspectionViewModel } from '../app/ui-types';
import { BackupPanel } from '../features/backup/BackupPanel';
import { deriveBackupStatus, formatBackupDateKst, readBackupStatus } from '../features/backup/backup-status';

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
  const [backupState, setBackupState] = useState<BackupStatusViewModel>(() =>
    backup.lastExportedAt ? backup : readBackupStatus(),
  );

  return (
    <section className="page-stack settings-page" aria-labelledby="settings-title">
      <header className="page-header settings-hero">
        <div>
          <p className="eyebrow">OPERATIONS</p>
          <h1 id="settings-title">설정</h1>
          <p className="settings-lead">보안, 백업, 입력 규칙과 표시 상태를 한곳에서 확인합니다.</p>
        </div>
        <div className="settings-overview" aria-label="설정 상태 요약">
          <span className="status-chip">Vault 보호됨</span>
          <span className={backupState.reminderDue ? 'status-chip warning' : 'status-chip'}>
            {backupState.reminderDue ? '백업 필요' : '백업 최신'}
          </span>
        </div>
      </header>

      <div className="settings-dashboard">
        <article className="settings-card settings-card-primary" aria-labelledby="security-settings-title">
          <div className="settings-card-heading">
            <div>
              <p className="card-kicker">SECURITY</p>
              <h2 id="security-settings-title">보안</h2>
              <p>현재 Vault 잠금 정책과 PIN 기준입니다.</p>
            </div>
            <span className="status-chip">활성</span>
          </div>
          <dl className="settings-status-list">
            <div>
              <dt>자동 잠금</dt>
              <dd>5분 비활성 시 잠금</dd>
            </div>
            <div>
              <dt>화면 숨김</dt>
              <dd>즉시 잠금</dd>
            </div>
            <div>
              <dt>새 PIN 기준</dt>
              <dd>10–12자리 숫자 · 반복/연속 패턴 차단</dd>
            </div>
          </dl>
          <div className="settings-card-actions">
            <button type="button" className="danger-button" aria-label="지금 잠그기" onClick={onLock}>
              지금 잠그기
            </button>
            <p>복호화된 세션 키를 즉시 메모리에서 제거합니다.</p>
          </div>
        </article>

        <article className="settings-card" aria-labelledby="backup-settings-title">
          <div className="settings-card-heading">
            <div>
              <p className="card-kicker">RECOVERY</p>
              <h2 id="backup-settings-title">백업 및 복구</h2>
              <p>암호화된 .vault 파일로 기기 변경과 재해 복구를 준비합니다.</p>
            </div>
            <span className={backupState.reminderDue ? 'status-chip warning' : 'status-chip'}>
              {backupState.reminderDue ? '점검 필요' : '정상'}
            </span>
          </div>
          <div className="backup-status-summary">
            <span>마지막 백업</span>
            <strong>{formatBackupDateKst(backupState.lastExportedAt)}</strong>
            <small>{backupState.reminderDue ? '중요한 변경 전 새 백업을 권장합니다.' : '최근 백업 기록이 있습니다.'}</small>
          </div>
          <button
            type="button"
            className="secondary-button settings-expand-button"
            aria-expanded={backupOpen}
            aria-controls="backup-settings-panel"
            onClick={() => setBackupOpen((value) => !value)}
          >
            {backupOpen ? '백업 도구 닫기' : '백업 도구 열기'}
            <span aria-hidden="true">{backupOpen ? '−' : '+'}</span>
          </button>
          {backupOpen ? (
            <div id="backup-settings-panel">
              <BackupPanel
                backup={backupState}
                onExport={onExportVault}
                onInspectImport={onInspectVaultImport}
                onApplyImport={onApplyVaultImport}
                onDownload={onDownloadVault}
                onBackupExported={(exportedAt) => setBackupState(deriveBackupStatus(exportedAt))}
              />
            </div>
          ) : null}
        </article>

        <article className="settings-card" aria-labelledby="rules-settings-title">
          <div className="settings-card-heading">
            <div>
              <p className="card-kicker">INPUT RULES</p>
              <h2 id="rules-settings-title">분류 규칙</h2>
              <p>현재 빠른 입력에서 자동으로 이해하는 규칙입니다.</p>
            </div>
            <span className="status-chip">읽기 전용</span>
          </div>
          <ul className="rule-list">
            <li><strong>금액</strong><span>3,000원 · 2500원 · ₩12,500 · 한글 금액</span></li>
            <li><strong>날짜</strong><span>‘어제’ 입력 시 전날 거래로 기록</span></li>
            <li><strong>식비 힌트</strong><span>점심 · 식사</span></li>
            <li><strong>교통 힌트</strong><span>택시 · 버스 · 지하철</span></li>
          </ul>
          <p className="settings-footnote">사용자 정의 규칙 편집은 다음 설정 단계에서 추가 예정입니다.</p>
        </article>

        <article className="settings-card" aria-labelledby="display-settings-title">
          <div className="settings-card-heading">
            <div>
              <p className="card-kicker">DISPLAY & APP</p>
              <h2 id="display-settings-title">표시 및 앱 상태</h2>
              <p>현재 적용 중인 표시 기준과 앱 실행 환경입니다.</p>
            </div>
            <span className="status-chip">정상</span>
          </div>
          <dl className="settings-status-list">
            <div>
              <dt>언어</dt>
              <dd>한국어</dd>
            </div>
            <div>
              <dt>금액 표시</dt>
              <dd>대한민국 원화(₩)</dd>
            </div>
            <div>
              <dt>앱 모드</dt>
              <dd>Local-first PWA</dd>
            </div>
            <div>
              <dt>정식 호스트</dt>
              <dd>Cloudflare Pages</dd>
            </div>
          </dl>
          <p className="settings-footnote">표시 옵션을 직접 변경하는 영구 설정은 아직 제공하지 않습니다.</p>
        </article>
      </div>
    </section>
  );
}

import { useState } from 'react';
import type { BackupStatusViewModel, VaultImportInspectionViewModel } from '../app/ui-types';
import { BackupPanel } from '../features/backup/BackupPanel';
import type { ClassificationSettingsViewModel, FixedVariableMode } from '../features/transactions/classification-settings';
import { clearBackupStatus, deriveBackupStatus, formatBackupDateKst, readBackupStatus } from '../features/backup/backup-status';

interface SettingsPageProps {
  readonly onLock: () => void;
  readonly backup: BackupStatusViewModel;
  readonly onExportVault: (input: { readonly recoveryKey: string }) => Promise<Uint8Array>;
  readonly onInspectVaultImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<VaultImportInspectionViewModel>;
  readonly onApplyVaultImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<void>;
  readonly onDownloadVault: (bytes: Uint8Array, filename: string) => void;
  readonly cloudEnrolled: boolean;
  readonly cloudConflict: boolean;
  readonly onEnrollCloud: (input: { readonly pin: string }) => Promise<void>;
  readonly onResetAllData: (input: { readonly pin: string }) => Promise<void>;
  readonly classificationSettings: ClassificationSettingsViewModel;
  readonly onSaveFixedVariableRule: (input: { readonly categoryId: string; readonly mode: FixedVariableMode }) => Promise<void>;
  readonly onAcceptCorrectionSuggestion: (input: { readonly categoryId: string; readonly keyword: string }) => Promise<void>;
  readonly onDismissCorrectionSuggestion: (input: { readonly categoryId: string; readonly keyword: string }) => Promise<void>;
  readonly onAddCategoryKeyword: (input: { readonly categoryId: string; readonly keyword: string }) => Promise<void>;
  readonly onRemoveCategoryKeyword: (input: { readonly categoryId: string; readonly keyword: string }) => Promise<void>;
  readonly onRestoreCategoryKeywords: (input: { readonly categoryId: string }) => Promise<void>;
  readonly onAddIncomeKeyword: (input: { readonly keyword: string }) => Promise<void>;
  readonly onRemoveIncomeKeyword: (input: { readonly keyword: string }) => Promise<void>;
  readonly onRestoreIncomeKeywords: () => Promise<void>;
}

export function SettingsPage({
  onLock,
  backup,
  onExportVault,
  onInspectVaultImport,
  onApplyVaultImport,
  onDownloadVault,
  cloudEnrolled,
  cloudConflict,
  onEnrollCloud,
  onResetAllData,
  classificationSettings,
  onSaveFixedVariableRule,
  onAcceptCorrectionSuggestion,
  onDismissCorrectionSuggestion,
  onAddCategoryKeyword,
  onRemoveCategoryKeyword,
  onRestoreCategoryKeywords,
  onAddIncomeKeyword,
  onRemoveIncomeKeyword,
  onRestoreIncomeKeywords,
}: SettingsPageProps) {
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupState, setBackupState] = useState<BackupStatusViewModel>(() =>
    backup.lastExportedAt ? backup : readBackupStatus(),
  );
  const [cloudPin, setCloudPin] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState(cloudEnrolled);
  const [resetPin, setResetPin] = useState('');
  const [resetPhrase, setResetPhrase] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [ruleBusy, setRuleBusy] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>({});
  const [incomeKeywordDraft, setIncomeKeywordDraft] = useState('');

  async function enableCloudSync() {
    setCloudError(null);
    if (!/^\d{10,12}$/.test(cloudPin)) {
      setCloudError('현재 사용 중인 10~12자리 PIN을 입력해주세요.');
      return;
    }
    setCloudBusy(true);
    try {
      await onEnrollCloud({ pin: cloudPin });
      setCloudReady(true);
      setCloudPin('');
    } catch {
      setCloudError('클라우드 동기화를 시작하지 못했습니다. PIN 또는 네트워크 상태를 확인해주세요.');
    } finally {
      setCloudPin('');
      setCloudBusy(false);
    }
  }

  async function resetAllData() {
    setResetError(null);
    if (!/^\d{10,12}$/.test(resetPin)) {
      setResetError('현재 사용 중인 10~12자리 PIN을 입력해주세요.');
      return;
    }
    if (resetPhrase !== '초기화') {
      setResetError('확인란에 “초기화”를 정확히 입력해주세요.');
      return;
    }

    setResetBusy(true);
    try {
      await onResetAllData({ pin: resetPin });
      clearBackupStatus();
    } catch {
      setResetError('초기화하지 못했습니다. PIN과 네트워크 상태를 확인해주세요.');
    } finally {
      setResetPin('');
      setResetPhrase('');
      setResetBusy(false);
    }
  }

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

        <article className="settings-card" aria-labelledby="cloud-sync-settings-title">
          <div className="settings-card-heading">
            <div>
              <p className="card-kicker">ENCRYPTED CLOUD SYNC</p>
              <h2 id="cloud-sync-settings-title">기기 간 동기화</h2>
              <p>같은 닉네임과 PIN으로 다른 기기에서도 기존 데이터를 이어서 사용합니다.</p>
            </div>
            <span className={cloudConflict ? 'status-chip warning' : cloudReady ? 'status-chip' : 'status-chip warning'}>
              {cloudConflict ? '충돌 확인 필요' : cloudReady ? '연결됨' : '설정 필요'}
            </span>
          </div>

          {cloudReady ? (
            <>
              <div className="backup-status-summary">
                <span>동기화 상태</span>
                <strong>{cloudConflict ? '동일 항목의 동시 수정이 감지되었습니다.' : '암호화 클라우드 동기화 사용 중'}</strong>
                <small>{cloudConflict
                  ? '서로 다른 신규 거래는 자동 병합되지만, 동일 항목을 양쪽에서 다르게 수정한 경우 자동 덮어쓰지 않습니다.'
                  : 'PIN, RecoveryKey, 금융 평문은 Cloudflare에 저장하지 않습니다.'}</small>
              </div>
              <p className="settings-footnote">이 기기에서 PIN으로 잠금 해제할 때 클라우드 변경사항을 확인하고, 로컬 변경사항은 암호화된 상태로 동기화합니다.</p>
            </>
          ) : (
            <div className="settings-card-actions">
              <label className="access-form">
                <span>현재 PIN</span>
                <input
                  aria-label="클라우드 동기화 PIN"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={12}
                  type="password"
                  value={cloudPin}
                  onChange={(event) => setCloudPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 12))}
                />
              </label>
              {cloudError ? <p role="alert" className="form-error">{cloudError}</p> : null}
              <button type="button" className="primary-button" disabled={cloudBusy} onClick={() => void enableCloudSync()}>
                클라우드 동기화 시작
              </button>
              <p>처음 한 번만 연결하면 이후 새 기기에서는 닉네임과 PIN으로 로그인할 수 있습니다.</p>
            </div>
          )}
        </article>

        <article className="settings-card" aria-labelledby="rules-settings-title">
          <div className="settings-card-heading">
            <div>
              <p className="card-kicker">INPUT RULES</p>
              <h2 id="rules-settings-title">분류 규칙</h2>
              <p>빠른 입력의 자동 분류와 카테고리별 고정·변동 기준을 관리합니다.</p>
            </div>
            <span className="status-chip">편집 가능</span>
          </div>

          {classificationSettings.correctionSuggestions.length > 0 ? (
            <div className="classification-rule-editor" aria-label="개인화 분류 규칙 제안">
              <h3>반복 수정으로 발견한 규칙 제안</h3>
              <p className="settings-footnote">동일한 단어를 3번 이상 같은 카테고리로 수정했어요. 승인하기 전에는 자동 분류에 반영되지 않습니다.</p>
              {classificationSettings.correctionSuggestions.map((suggestion) => (
                <div className="classification-rule-row classification-rule-row-expanded" key={suggestion.keyword}>
                  <strong>{suggestion.keyword} → {suggestion.categoryLabel} ({suggestion.count}회 수정)</strong>
                  <div className="settings-card-actions">
                    <button type="button" className="secondary-button" disabled={ruleBusy !== null}
                      onClick={() => {
                        setRuleBusy(suggestion.keyword);
                        setRuleError(null);
                        void onAcceptCorrectionSuggestion({ keyword: suggestion.keyword, categoryId: suggestion.categoryId })
                          .catch(() => setRuleError('이 키워드가 다른 카테고리에 이미 지정되어 있을 수 있어요. 기존 규칙을 확인해주세요.'))
                          .finally(() => setRuleBusy(null));
                      }}>규칙 추가 승인</button>
                    <button type="button" className="secondary-button" disabled={ruleBusy !== null}
                      onClick={() => {
                        setRuleBusy(suggestion.keyword);
                        void onDismissCorrectionSuggestion({ keyword: suggestion.keyword, categoryId: suggestion.categoryId })
                          .catch(() => setRuleError('제안을 해제하지 못했습니다.'))
                          .finally(() => setRuleBusy(null));
                      }}>제안 무시</button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <ul className="rule-list">
            <li><strong>수입</strong><span>월급 · 급여 · 부수입 · 용돈 · 마일리지 · 포인트 · 리워드 등</span></li>
            <li><strong>날짜</strong><span>오늘 · 어제 · 그제 · 그저께 · n일 전</span></li>
            <li><strong>식비</strong><span>아침 · 점심 · 저녁 · 식사 · 간식 · 커피 · 음료 · 디저트 · 도시락 등</span></li>
            <li><strong>교통</strong><span>대중교통 · 택시 · 버스 · 지하철 · 기차 · 주차 · 주유 등</span></li>
          </ul>

          <div className="classification-rule-editor" aria-labelledby="income-keywords-title">
            <div className="settings-card-heading">
              <div>
                <h3 id="income-keywords-title">수입 자동분류 키워드</h3>
                <p>아래 단어가 포함된 빠른 입력은 수입으로 분류합니다. ‘수입’과 ‘지출’ 직접 입력 명령은 항상 유지됩니다.</p>
              </div>
            </div>
            <div className="keyword-editor">
              <div className="keyword-chip-list" aria-label="수입 키워드 목록">
                {classificationSettings.incomeKeywords.map((keyword) => (
                  <button
                    key={`${keyword.source}:${keyword.value}`}
                    type="button"
                    className="keyword-chip"
                    title={keyword.source === 'default' ? '기본 수입 키워드 제거' : '사용자 수입 키워드 제거'}
                    disabled={ruleBusy === 'income'}
                    onClick={() => {
                      setRuleError(null);
                      setRuleBusy('income');
                      void onRemoveIncomeKeyword({ keyword: keyword.value })
                        .catch(() => setRuleError('수입 키워드를 삭제하지 못했습니다.'))
                        .finally(() => setRuleBusy(null));
                    }}
                  >
                    {keyword.value}<span aria-hidden="true"> ×</span>
                  </button>
                ))}
              </div>
              <div className="keyword-add-row">
                <input
                  aria-label="새 수입 키워드"
                  maxLength={40}
                  placeholder="예: 원고료"
                  value={incomeKeywordDraft}
                  onChange={(event) => setIncomeKeywordDraft(event.currentTarget.value)}
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={ruleBusy === 'income' || !incomeKeywordDraft.trim()}
                  onClick={() => {
                    const keyword = incomeKeywordDraft.trim();
                    if (!keyword) return;
                    setRuleError(null);
                    setRuleBusy('income');
                    void onAddIncomeKeyword({ keyword })
                      .then(() => setIncomeKeywordDraft(''))
                      .catch(() => setRuleError('예약어이거나 저장할 수 없는 수입 키워드입니다.'))
                      .finally(() => setRuleBusy(null));
                  }}
                >
                  추가
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={ruleBusy === 'income' || !classificationSettings.hasIncomeKeywordChanges}
                  onClick={() => {
                    setRuleError(null);
                    setRuleBusy('income');
                    void onRestoreIncomeKeywords()
                      .catch(() => setRuleError('기본 수입 키워드로 복원하지 못했습니다.'))
                      .finally(() => setRuleBusy(null));
                  }}
                >
                  기본값 복원
                </button>
              </div>
            </div>
          </div>

          <div className="classification-rule-editor" aria-labelledby="fixed-variable-rules-title">
            <div className="settings-card-heading">
              <div>
                <h3 id="fixed-variable-rules-title">고정/변동 지출 기준</h3>
                <p>자동은 기본 분류를 사용하고, 직접 지정한 값은 기본 키워드보다 우선합니다.</p>
              </div>
            </div>

            <div className="classification-rule-grid">
              {classificationSettings.categories.map((category) => (
                <div key={category.id} className="classification-rule-row classification-rule-row-expanded">
                  <div className="classification-rule-main">
                    <span>
                      <strong>{category.label}</strong>
                      <small>
                        기본값 {category.defaultFixedVariable === 'fixed'
                          ? '고정'
                          : category.defaultFixedVariable === 'variable'
                            ? '변동'
                            : '혼합'}
                      </small>
                    </span>
                    <select
                      aria-label={`${category.label} 고정 변동 규칙`}
                      value={category.mode}
                      disabled={ruleBusy === category.id}
                      onChange={(event) => {
                        const mode = event.currentTarget.value as FixedVariableMode;
                        setRuleError(null);
                        setRuleBusy(category.id);
                        void onSaveFixedVariableRule({ categoryId: category.id, mode })
                          .catch(() => setRuleError('분류 규칙을 저장하지 못했습니다. 잠금 상태나 동기화 상태를 확인해주세요.'))
                          .finally(() => setRuleBusy(null));
                      }}
                    >
                      <option value="auto">자동</option>
                      <option value="fixed">항상 고정</option>
                      <option value="variable">항상 변동</option>
                    </select>
                  </div>

                  <div className="keyword-editor">
                    <div className="keyword-chip-list" aria-label={`${category.label} 키워드 목록`}>
                      {category.keywords.map((keyword) => (
                        <button
                          key={`${keyword.source}:${keyword.value}`}
                          type="button"
                          className="keyword-chip"
                          title={keyword.source === 'default' ? '기본 키워드 제거' : '사용자 키워드 제거'}
                          onClick={() => {
                            setRuleError(null);
                            setRuleBusy(category.id);
                            void onRemoveCategoryKeyword({ categoryId: category.id, keyword: keyword.value })
                              .catch(() => setRuleError('키워드를 삭제하지 못했습니다.'))
                              .finally(() => setRuleBusy(null));
                          }}
                        >
                          {keyword.value}<span aria-hidden="true"> ×</span>
                        </button>
                      ))}
                    </div>
                    <div className="keyword-add-row">
                      <input
                        aria-label={`${category.label} 새 키워드`}
                        maxLength={40}
                        placeholder="새 키워드"
                        value={keywordDrafts[category.id] ?? ''}
                        onChange={(event) => setKeywordDrafts((current) => ({
                          ...current,
                          [category.id]: event.currentTarget.value,
                        }))}
                      />
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={ruleBusy === category.id || !(keywordDrafts[category.id] ?? '').trim()}
                        onClick={() => {
                          const keyword = (keywordDrafts[category.id] ?? '').trim();
                          if (!keyword) return;
                          setRuleError(null);
                          setRuleBusy(category.id);
                          void onAddCategoryKeyword({ categoryId: category.id, keyword })
                            .then(() => setKeywordDrafts((current) => ({ ...current, [category.id]: '' })))
                            .catch(() => setRuleError('이미 다른 카테고리에 사용 중인 키워드이거나 저장할 수 없는 키워드입니다.'))
                            .finally(() => setRuleBusy(null));
                        }}
                      >
                        추가
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={ruleBusy === category.id || !category.hasKeywordChanges}
                        onClick={() => {
                          setRuleError(null);
                          setRuleBusy(category.id);
                          void onRestoreCategoryKeywords({ categoryId: category.id })
                            .catch(() => setRuleError('기본 키워드로 복원하지 못했습니다.'))
                            .finally(() => setRuleBusy(null));
                        }}
                      >
                        기본값 복원
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {ruleError ? <p role="alert" className="form-error">{ruleError}</p> : null}
            <p className="settings-footnote">이 설정은 Vault 내부에 암호화해 저장하며, 클라우드 동기화를 사용하면 다른 기기에도 암호화된 상태로 전달됩니다.</p>
          </div>
        </article>

        <article className="settings-card" aria-labelledby="reset-settings-title">
          <div className="settings-card-heading">
            <div>
              <p className="card-kicker">DANGER ZONE</p>
              <h2 id="reset-settings-title">전체 초기화</h2>
              <p>현재 My Diary 데이터를 모두 지우고 처음 시작 상태로 되돌립니다.</p>
            </div>
            <span className="status-chip warning">되돌릴 수 없음</span>
          </div>

          <div className="backup-status-summary">
            <span>삭제 범위</span>
            <strong>{cloudReady ? '현재 기기 + 클라우드 계정 데이터' : '현재 기기의 로컬 Vault 데이터'}</strong>
            <small>
              {cloudReady
                ? 'Cloudflare D1의 계정·세션 메타데이터와 R2의 암호화 Vault 스냅샷도 삭제됩니다.'
                : '이 기기에 저장된 암호화 Vault와 기록을 삭제합니다.'}
            </small>
          </div>

          <p className="settings-footnote">
            다른 기기에 이미 저장된 로컬 Vault 사본과 별도로 내려받아 둔 .vault 백업 파일은 원격으로 삭제할 수 없습니다.
            필요하면 각 기기와 백업 파일도 직접 정리해야 합니다.
          </p>

          <div className="settings-card-actions">
            <label className="access-form">
              <span>현재 PIN</span>
              <input
                aria-label="초기화 확인 PIN"
                inputMode="numeric"
                autoComplete="off"
                maxLength={12}
                type="password"
                value={resetPin}
                onChange={(event) => setResetPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 12))}
              />
            </label>
            <label className="access-form">
              <span>확인을 위해 “초기화” 입력</span>
              <input
                aria-label="초기화 확인 문구"
                autoComplete="off"
                value={resetPhrase}
                onChange={(event) => setResetPhrase(event.currentTarget.value)}
              />
            </label>
            {resetError ? <p role="alert" className="form-error">{resetError}</p> : null}
            <button
              type="button"
              className="danger-button"
              disabled={resetBusy}
              onClick={() => void resetAllData()}
            >
              모든 데이터 초기화
            </button>
            <p>PIN 재확인과 확인 문구가 모두 일치해야 실행됩니다.</p>
          </div>
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

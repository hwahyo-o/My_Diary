import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { AccessGate } from '../features/access/AccessGate';
import { HostingNotice } from '../components/HostingNotice';
import type { AccessState, AnalyticsViewModel, AppRuntimePorts, AssetsViewModel, CalendarViewModel, DashboardViewModel } from './ui-types';
import { defaultBackupStatus, emptyAnalytics, emptyAssets, emptyCalendar, emptyClassificationSettings, emptyDashboard } from './ui-types';

const failClosedRuntime: AppRuntimePorts = {
  async createProfile() {
    throw new Error('Vault runtime is not connected.');
  },
  async unlock() {
    throw new Error('Vault runtime is not connected.');
  },
  async submitTransaction() {
    throw new Error('Transaction runtime is not connected.');
  },
};

interface AppProps {
  readonly initialAccess?: AccessState;
  readonly dashboard?: DashboardViewModel;
  readonly assets?: AssetsViewModel;
  readonly analytics?: AnalyticsViewModel;
  readonly calendar?: CalendarViewModel;
  readonly runtime?: AppRuntimePorts;
}

export function App({ initialAccess, dashboard, assets, analytics, calendar, runtime = failClosedRuntime }: AppProps) {
  const runtimeSnapshot = runtime.getSnapshot?.();
  const [cloudStatus, setCloudStatus] = useState(runtimeSnapshot?.cloudSyncStatus ?? 'not-connected');
  const [access, setAccess] = useState<AccessState>(initialAccess ?? runtimeSnapshot?.access ?? 'onboarding');
  const [dashboardState, setDashboardState] = useState<DashboardViewModel>(dashboard ?? runtimeSnapshot?.dashboard ?? emptyDashboard);
  const [assetsState, setAssetsState] = useState<AssetsViewModel>(assets ?? runtimeSnapshot?.assets ?? emptyAssets);
  const [analyticsState, setAnalyticsState] = useState<AnalyticsViewModel>(analytics ?? runtimeSnapshot?.analytics ?? emptyAnalytics);
  const [calendarState, setCalendarState] = useState<CalendarViewModel>(calendar ?? runtimeSnapshot?.calendar ?? emptyCalendar);
  const [classificationSettingsState, setClassificationSettingsState] = useState(runtimeSnapshot?.classificationSettings ?? emptyClassificationSettings);

  useEffect(() => {
    if (!runtime.subscribe) return;
    return runtime.subscribe((snapshot) => {
      setCloudStatus(snapshot.cloudSyncStatus ?? 'not-connected');
      setDashboardState(snapshot.dashboard);
      setAssetsState(snapshot.assets);
      setAnalyticsState(snapshot.analytics);
      setCalendarState(snapshot.calendar);
      setClassificationSettingsState(snapshot.classificationSettings ?? emptyClassificationSettings);
      if (snapshot.access !== 'unlocked') setAccess(snapshot.access);
    });
  }, [runtime]);

  if (access !== 'unlocked') {
    const recoveryProps = runtime.recoverFromVault
      ? { onRecover: (input: { readonly packageBytes: Uint8Array; readonly recoveryKey: string; readonly pin: string }) => runtime.recoverFromVault!(input) }
      : {};
    const cloudLoginProps = runtime.loginFromCloud
      ? { onCloudLogin: (input: { readonly nickname: string; readonly pin: string }) => runtime.loginFromCloud!(input) }
      : {};
    return (
      <>
      <HostingNotice />
      <AccessGate
        mode={access}
        onCreateProfile={(input) => runtime.createProfile(input)}
        onUnlock={(pin) => runtime.unlock(pin)}
        {...recoveryProps}
        {...cloudLoginProps}
        onAccessGranted={() => {
          const next = runtime.getSnapshot?.();
          if (next) {
            setDashboardState(next.dashboard);
            setAssetsState(next.assets);
            setAnalyticsState(next.analytics);
            setCalendarState(next.calendar);
            setClassificationSettingsState(next.classificationSettings ?? emptyClassificationSettings);
            setAccess(next.access);
            return;
          }
          setAccess('unlocked');
        }}
      />
      </>
    );
  }

  return (
    <>
      <HostingNotice />
      <AppShell
      dashboard={dashboardState}
      assets={assetsState}
      analytics={analyticsState}
      calendar={calendarState}
      classificationSettings={classificationSettingsState}
      backup={defaultBackupStatus}
      onSubmitTransaction={(input) => runtime.submitTransaction(input)}
      {...(runtime.previewQuickBatch
        ? { onPreviewQuickBatch: (text: string) => runtime.previewQuickBatch!(text) }
        : {})}
      {...(runtime.previewQuickTransaction
        ? { onPreviewQuickTransaction: (text: string) => runtime.previewQuickTransaction!(text) }
        : {})}
      onUpdateTransaction={(input) => {
        if (!runtime.updateTransaction) return Promise.reject(new Error('Transaction edit runtime is not connected.'));
        return runtime.updateTransaction(input);
      }}
      onDeleteTransaction={(id) => {
        if (!runtime.deleteTransaction) return Promise.reject(new Error('Transaction delete runtime is not connected.'));
        return runtime.deleteTransaction(id);
      }}
      onRestoreTransaction={(id) => {
        if (!runtime.restoreTransaction) return Promise.reject(new Error('Transaction restore runtime is not connected.'));
        return runtime.restoreTransaction(id);
      }}
      {...(runtime.previewCloudBudgetComparison ? { onPreviewCloudBudgetComparison: () => runtime.previewCloudBudgetComparison!() } : {})}
      onListBudgetCandidates={() => runtime.listCurrentMonthBudgetCandidates?.() ?? Promise.reject(new Error('Budget history is not connected.'))}
      onConfirmBudgetCandidate={(id, expectedLatestId) => runtime.confirmBudgetCandidate?.(id, expectedLatestId) ?? Promise.reject(new Error('Budget confirmation is not connected.'))}
      onSaveBudget={(input) => {
        if (!runtime.saveBudget) return Promise.reject(new Error('Budget runtime is not connected.'));
        return runtime.saveBudget(input);
      }}
      onSaveAccount={(input) => {
        if (!runtime.saveAccount) return Promise.reject(new Error('Account runtime is not connected.'));
        return runtime.saveAccount(input);
      }}
      onSaveHolding={(input) => {
        if (!runtime.saveHolding) return Promise.reject(new Error('Holding runtime is not connected.'));
        return runtime.saveHolding(input);
      }}
      onSaveLoan={(input) => {
        if (!runtime.saveLoan) return Promise.reject(new Error('Loan runtime is not connected.'));
        return runtime.saveLoan(input);
      }}
      onExportVault={(input) => {
        if (!runtime.exportVault) return Promise.reject(new Error('Backup export is not connected.'));
        return runtime.exportVault(input);
      }}
      onInspectVaultImport={(bytes, input) => {
        if (!runtime.inspectVaultImport) return Promise.reject(new Error('Backup import inspection is not connected.'));
        return runtime.inspectVaultImport(bytes, input);
      }}
      onApplyVaultImport={(bytes, input) => {
        if (!runtime.applyVaultImport) return Promise.reject(new Error('Backup import is not connected.'));
        return runtime.applyVaultImport(bytes, input);
      }}
      cloudEnrolled={runtime.isCloudEnrolled?.() ?? false}
      cloudConflict={runtime.hasCloudConflict?.() ?? false}
      cloudSyncStatus={cloudStatus}
      onRetryCloudSync={() => runtime.retryCloudSync?.() ?? Promise.reject(new Error('Cloud sync retry is unavailable.'))}
      onEnrollCloud={(input) => {
        if (!runtime.enrollCloud) return Promise.reject(new Error('Cloud sync is not connected.'));
        return runtime.enrollCloud(input);
      }}
      onRotateRecoveryKey={(input) => {
        if (!runtime.rotateRecoveryKey) return Promise.reject(new Error('Recovery rotation is unavailable.'));
        return runtime.rotateRecoveryKey(input);
      }}
      onResetAllData={(input) => {
        if (!runtime.resetAllData) return Promise.reject(new Error('Reset runtime is not connected.'));
        return runtime.resetAllData(input);
      }}
      onSaveFixedVariableRule={(input) => {
        if (!runtime.saveFixedVariableRule) return Promise.reject(new Error('Classification settings runtime is not connected.'));
        return runtime.saveFixedVariableRule(input);
      }}
      onAcceptCorrectionSuggestion={(input) => {
        if (!runtime.acceptCorrectionSuggestion) return Promise.reject(new Error('Suggestion runtime is not connected.'));
        return runtime.acceptCorrectionSuggestion(input);
      }}
      onDismissCorrectionSuggestion={(input) => {
        if (!runtime.dismissCorrectionSuggestion) return Promise.reject(new Error('Suggestion runtime is not connected.'));
        return runtime.dismissCorrectionSuggestion(input);
      }}
      onAddCategoryKeyword={(input) => {
        if (!runtime.addCategoryKeyword) return Promise.reject(new Error('Classification keyword runtime is not connected.'));
        return runtime.addCategoryKeyword(input);
      }}
      onRemoveCategoryKeyword={(input) => {
        if (!runtime.removeCategoryKeyword) return Promise.reject(new Error('Classification keyword runtime is not connected.'));
        return runtime.removeCategoryKeyword(input);
      }}
      onRestoreCategoryKeywords={(input) => {
        if (!runtime.restoreCategoryKeywords) return Promise.reject(new Error('Classification keyword runtime is not connected.'));
        return runtime.restoreCategoryKeywords(input);
      }}
      onAddIncomeKeyword={(input) => {
        if (!runtime.addIncomeKeyword) return Promise.reject(new Error('Income keyword runtime is not connected.'));
        return runtime.addIncomeKeyword(input);
      }}
      onRemoveIncomeKeyword={(input) => {
        if (!runtime.removeIncomeKeyword) return Promise.reject(new Error('Income keyword runtime is not connected.'));
        return runtime.removeIncomeKeyword(input);
      }}
      onRestoreIncomeKeywords={() => {
        if (!runtime.restoreIncomeKeywords) return Promise.reject(new Error('Income keyword runtime is not connected.'));
        return runtime.restoreIncomeKeywords();
      }}
      onLock={() => runtime.lock?.()}
    />
    </>
  );
}

import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { AccessGate } from '../features/access/AccessGate';
import { HostingNotice } from '../components/HostingNotice';
import type { AccessState, AnalyticsViewModel, AppRuntimePorts, AssetsViewModel, DashboardViewModel } from './ui-types';
import { defaultBackupStatus, emptyAnalytics, emptyAssets, emptyDashboard } from './ui-types';

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
  readonly runtime?: AppRuntimePorts;
}

export function App({ initialAccess, dashboard, assets, analytics, runtime = failClosedRuntime }: AppProps) {
  const runtimeSnapshot = runtime.getSnapshot?.();
  const [access, setAccess] = useState<AccessState>(initialAccess ?? runtimeSnapshot?.access ?? 'onboarding');
  const [dashboardState, setDashboardState] = useState<DashboardViewModel>(dashboard ?? runtimeSnapshot?.dashboard ?? emptyDashboard);
  const [assetsState, setAssetsState] = useState<AssetsViewModel>(assets ?? runtimeSnapshot?.assets ?? emptyAssets);
  const [analyticsState, setAnalyticsState] = useState<AnalyticsViewModel>(analytics ?? runtimeSnapshot?.analytics ?? emptyAnalytics);

  useEffect(() => {
    if (!runtime.subscribe) return;
    return runtime.subscribe((snapshot) => {
      setDashboardState(snapshot.dashboard);
      setAssetsState(snapshot.assets);
      setAnalyticsState(snapshot.analytics);
      if (snapshot.access !== 'unlocked') setAccess(snapshot.access);
    });
  }, [runtime]);

  if (access !== 'unlocked') {
    const recoveryProps = runtime.recoverFromVault
      ? { onRecover: (input: { readonly packageBytes: Uint8Array; readonly recoveryKey: string; readonly pin: string }) => runtime.recoverFromVault!(input) }
      : {};
    return (
      <>
      <HostingNotice />
      <AccessGate
        mode={access}
        onCreateProfile={(input) => runtime.createProfile(input)}
        onUnlock={(pin) => runtime.unlock(pin)}
        {...recoveryProps}
        onAccessGranted={() => {
          const next = runtime.getSnapshot?.();
          if (next) {
            setDashboardState(next.dashboard);
            setAssetsState(next.assets);
            setAnalyticsState(next.analytics);
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
      backup={defaultBackupStatus}
      onSubmitTransaction={(input) => runtime.submitTransaction(input)}
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
      onLock={() => runtime.lock?.()}
    />
    </>
  );
}

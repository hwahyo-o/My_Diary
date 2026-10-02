import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { AccessGate } from '../features/access/AccessGate';
import type { AccessState, AppRuntimePorts, DashboardViewModel } from './ui-types';
import { emptyDashboard } from './ui-types';

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
  readonly runtime?: AppRuntimePorts;
}

export function App({ initialAccess, dashboard, runtime = failClosedRuntime }: AppProps) {
  const runtimeSnapshot = runtime.getSnapshot?.();
  const [access, setAccess] = useState<AccessState>(initialAccess ?? runtimeSnapshot?.access ?? 'onboarding');
  const [dashboardState, setDashboardState] = useState<DashboardViewModel>(dashboard ?? runtimeSnapshot?.dashboard ?? emptyDashboard);

  useEffect(() => {
    if (!runtime.subscribe) return;
    return runtime.subscribe((snapshot) => {
      setDashboardState(snapshot.dashboard);
      if (snapshot.access !== 'unlocked') setAccess(snapshot.access);
    });
  }, [runtime]);

  if (access !== 'unlocked') {
    return (
      <AccessGate
        mode={access}
        onCreateProfile={(input) => runtime.createProfile(input)}
        onUnlock={(pin) => runtime.unlock(pin)}
        onAccessGranted={() => {
          const next = runtime.getSnapshot?.();
          if (next) setDashboardState(next.dashboard);
          setAccess('unlocked');
        }}
      />
    );
  }

  return (
    <AppShell
      dashboard={dashboardState}
      onSubmitTransaction={(input) => runtime.submitTransaction(input)}
      onLock={() => runtime.lock?.()}
    />
  );
}

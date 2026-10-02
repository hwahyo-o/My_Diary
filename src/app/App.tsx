import { useState } from 'react';
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

export function App({ initialAccess = 'onboarding', dashboard = emptyDashboard, runtime = failClosedRuntime }: AppProps) {
  const [access, setAccess] = useState<AccessState>(initialAccess);

  if (access !== 'unlocked') {
    return (
      <AccessGate
        mode={access}
        onCreateProfile={runtime.createProfile}
        onUnlock={runtime.unlock}
        onAccessGranted={() => setAccess('unlocked')}
      />
    );
  }

  return <AppShell dashboard={dashboard} onSubmitTransaction={runtime.submitTransaction} />;
}

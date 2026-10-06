import { useRef, useState } from 'react';
import type {
  AppPage,
  AnalyticsViewModel,
  AssetsViewModel,
  BackupStatusViewModel,
  DashboardViewModel,
  SaveAccountInput,
  SaveHoldingInput,
  SaveLoanInput,
  TransactionSubmission,
  VaultImportInspectionViewModel,
} from '../app/ui-types';
import { downloadVaultBytes } from '../app/runtime/browser-file-io';
import { TransactionEntrySheet } from '../features/transactions/TransactionEntrySheet';
import { AssetsPage } from '../pages/AssetsPage';
import { CalendarPage } from '../pages/CalendarPage';
import { HomePage } from '../pages/HomePage';
import { SettingsPage } from '../pages/SettingsPage';
import { StatsPage } from '../pages/StatsPage';
import { BottomNavigation } from './BottomNavigation';

interface AppShellProps {
  readonly dashboard: DashboardViewModel;
  readonly assets: AssetsViewModel;
  readonly analytics: AnalyticsViewModel;
  readonly backup: BackupStatusViewModel;
  readonly onSubmitTransaction: (input: TransactionSubmission) => Promise<void>;
  readonly onSaveBudget: (input: { readonly limitMinor: number }) => Promise<void>;
  readonly onSaveAccount: (input: SaveAccountInput) => Promise<string>;
  readonly onSaveHolding: (input: SaveHoldingInput) => Promise<void>;
  readonly onSaveLoan: (input: SaveLoanInput) => Promise<void>;
  readonly onExportVault: (input: { readonly recoveryKey: string }) => Promise<Uint8Array>;
  readonly onInspectVaultImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<VaultImportInspectionViewModel>;
  readonly onApplyVaultImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<void>;
  readonly onLock: () => void;
}

export function AppShell({
  dashboard,
  assets,
  analytics,
  backup,
  onSubmitTransaction,
  onSaveBudget,
  onSaveAccount,
  onSaveHolding,
  onSaveLoan,
  onExportVault,
  onInspectVaultImport,
  onApplyVaultImport,
  onLock,
}: AppShellProps) {
  const [page, setPage] = useState<AppPage>('home');
  const [entryOpen, setEntryOpen] = useState(false);
  const quickAddButtonRef = useRef<HTMLButtonElement>(null);

  let content;
  switch (page) {
    case 'home':
      content = <HomePage dashboard={dashboard} onQuickAdd={() => setEntryOpen(true)} quickAddButtonRef={quickAddButtonRef} />;
      break;
    case 'calendar':
      content = <CalendarPage />;
      break;
    case 'stats':
      content = <StatsPage incomeMinor={dashboard.incomeMinor} expenseMinor={dashboard.expenseMinor} budget={dashboard.budget} analytics={analytics} onSaveBudget={onSaveBudget} />;
      break;
    case 'assets':
      content = <AssetsPage assets={assets} onSaveAccount={onSaveAccount} onSaveHolding={onSaveHolding} onSaveLoan={onSaveLoan} />;
      break;
    case 'settings':
      content = (
        <SettingsPage
          onLock={onLock}
          backup={backup}
          onExportVault={onExportVault}
          onInspectVaultImport={onInspectVaultImport}
          onApplyVaultImport={onApplyVaultImport}
          onDownloadVault={downloadVaultBytes}
        />
      );
      break;
  }

  return (
    <main className="protected-shell">
      <div className="app-content">{content}</div>
      <BottomNavigation currentPage={page} onNavigate={setPage} />
      <TransactionEntrySheet
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        onSubmitTransaction={onSubmitTransaction}
        returnFocusTo={quickAddButtonRef.current}
      />
    </main>
  );
}

import { useRef, useState } from 'react';
import type {
  AppPage,
  AnalyticsViewModel,
  AssetsViewModel,
  BackupStatusViewModel,
  CalendarViewModel,
  DashboardViewModel,
  QuickTransactionPreviewViewModel,
  QuickBatchPreview,
  SaveAccountInput,
  SaveHoldingInput,
  SaveLoanInput,
  TransactionSubmission,
  UpdateTransactionInput,
  VaultImportInspectionViewModel,
} from '../app/ui-types';
import type { ClassificationSettingsViewModel, FixedVariableMode } from '../features/transactions/classification-settings';
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
  readonly calendar: CalendarViewModel;
  readonly classificationSettings: ClassificationSettingsViewModel;
  readonly onSubmitTransaction: (input: TransactionSubmission) => Promise<void>;
  readonly onPreviewQuickBatch?: (text: string) => QuickBatchPreview;
  readonly onPreviewQuickTransaction?: (text: string) => QuickTransactionPreviewViewModel;
  readonly onUpdateTransaction: (input: UpdateTransactionInput) => Promise<void>;
  readonly onDeleteTransaction: (id: string) => Promise<void>;
  readonly onRestoreTransaction: (id: string) => Promise<void>;
  readonly onSaveBudget: (input: { readonly limitMinor: number }) => Promise<void>;
  readonly onSaveAccount: (input: SaveAccountInput) => Promise<string>;
  readonly onSaveHolding: (input: SaveHoldingInput) => Promise<void>;
  readonly onSaveLoan: (input: SaveLoanInput) => Promise<void>;
  readonly onExportVault: (input: { readonly recoveryKey: string }) => Promise<Uint8Array>;
  readonly onInspectVaultImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<VaultImportInspectionViewModel>;
  readonly onApplyVaultImport: (bytes: Uint8Array, input: { readonly recoveryKey: string }) => Promise<void>;
  readonly cloudEnrolled: boolean;
  readonly cloudConflict: boolean;
  readonly onEnrollCloud: (input: { readonly pin: string }) => Promise<void>;
  readonly onRotateRecoveryKey: (input: { readonly pin: string }) => Promise<string>;
  readonly onResetAllData: (input: { readonly pin: string }) => Promise<void>;
  readonly onSaveFixedVariableRule: (input: { readonly categoryId: string; readonly mode: FixedVariableMode }) => Promise<void>;
  readonly onAcceptCorrectionSuggestion: (input: { readonly categoryId: string; readonly keyword: string }) => Promise<void>;
  readonly onDismissCorrectionSuggestion: (input: { readonly categoryId: string; readonly keyword: string }) => Promise<void>;
  readonly onAddCategoryKeyword: (input: { readonly categoryId: string; readonly keyword: string }) => Promise<void>;
  readonly onRemoveCategoryKeyword: (input: { readonly categoryId: string; readonly keyword: string }) => Promise<void>;
  readonly onRestoreCategoryKeywords: (input: { readonly categoryId: string }) => Promise<void>;
  readonly onAddIncomeKeyword: (input: { readonly keyword: string }) => Promise<void>;
  readonly onRemoveIncomeKeyword: (input: { readonly keyword: string }) => Promise<void>;
  readonly onRestoreIncomeKeywords: () => Promise<void>;
  readonly onLock: () => void;
}

export function AppShell({
  dashboard,
  assets,
  analytics,
  backup,
  calendar,
  classificationSettings,
  onSubmitTransaction,
  onPreviewQuickTransaction,
  onPreviewQuickBatch,
  onUpdateTransaction,
  onDeleteTransaction,
  onRestoreTransaction,
  onSaveBudget,
  onSaveAccount,
  onSaveHolding,
  onSaveLoan,
  onExportVault,
  onInspectVaultImport,
  onApplyVaultImport,
  cloudEnrolled,
  cloudConflict,
  onEnrollCloud,
  onRotateRecoveryKey,
  onResetAllData,
  onSaveFixedVariableRule,
  onAcceptCorrectionSuggestion,
  onDismissCorrectionSuggestion,
  onAddCategoryKeyword,
  onRemoveCategoryKeyword,
  onRestoreCategoryKeywords,
  onAddIncomeKeyword,
  onRemoveIncomeKeyword,
  onRestoreIncomeKeywords,
  onLock,
}: AppShellProps) {
  const [page, setPage] = useState<AppPage>('home');
  const [entryOpen, setEntryOpen] = useState(false);
  const quickAddButtonRef = useRef<HTMLButtonElement>(null);

  let content;
  switch (page) {
    case 'home':
      content = <HomePage dashboard={dashboard} analytics={analytics} assets={assets} calendar={calendar} onQuickAdd={() => setEntryOpen(true)} quickAddButtonRef={quickAddButtonRef} />;
      break;
    case 'calendar':
      content = <CalendarPage calendar={calendar} onQuickAdd={() => setEntryOpen(true)} onUpdateTransaction={onUpdateTransaction} onDeleteTransaction={onDeleteTransaction} onRestoreTransaction={onRestoreTransaction} />;
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
          cloudEnrolled={cloudEnrolled}
          cloudConflict={cloudConflict}
          onEnrollCloud={onEnrollCloud}
          onRotateRecoveryKey={onRotateRecoveryKey}
          onResetAllData={onResetAllData}
          classificationSettings={classificationSettings}
          onSaveFixedVariableRule={onSaveFixedVariableRule}
          onAcceptCorrectionSuggestion={onAcceptCorrectionSuggestion}
          onDismissCorrectionSuggestion={onDismissCorrectionSuggestion}
          onAddCategoryKeyword={onAddCategoryKeyword}
          onRemoveCategoryKeyword={onRemoveCategoryKeyword}
          onRestoreCategoryKeywords={onRestoreCategoryKeywords}
          onAddIncomeKeyword={onAddIncomeKeyword}
          onRemoveIncomeKeyword={onRemoveIncomeKeyword}
          onRestoreIncomeKeywords={onRestoreIncomeKeywords}
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
        {...(onPreviewQuickBatch ? { onPreviewQuickBatch } : {})}
        {...(onPreviewQuickTransaction ? { onPreviewQuickTransaction } : {})}
        returnFocusTo={quickAddButtonRef.current}
      />
    </main>
  );
}

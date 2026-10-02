import { useRef, useState } from 'react';
import type { AppPage, DashboardViewModel, TransactionSubmission } from '../app/ui-types';
import { TransactionEntrySheet } from '../features/transactions/TransactionEntrySheet';
import { AssetsPage } from '../pages/AssetsPage';
import { CalendarPage } from '../pages/CalendarPage';
import { HomePage } from '../pages/HomePage';
import { SettingsPage } from '../pages/SettingsPage';
import { StatsPage } from '../pages/StatsPage';
import { BottomNavigation } from './BottomNavigation';

interface AppShellProps {
  readonly dashboard: DashboardViewModel;
  readonly onSubmitTransaction: (input: TransactionSubmission) => Promise<void>;
  readonly onLock: () => void;
}

export function AppShell({ dashboard, onSubmitTransaction, onLock }: AppShellProps) {
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
      content = <StatsPage incomeMinor={dashboard.incomeMinor} expenseMinor={dashboard.expenseMinor} />;
      break;
    case 'assets':
      content = <AssetsPage />;
      break;
    case 'settings':
      content = <SettingsPage onLock={onLock} />;
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

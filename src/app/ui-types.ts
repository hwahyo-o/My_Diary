export type AccessState = 'onboarding' | 'locked' | 'unlocked';
export type AppPage = 'home' | 'calendar' | 'stats' | 'assets' | 'settings';

export interface BudgetSummaryViewModel {
  readonly usagePercent: number;
  readonly remainingMinor: number;
  readonly status: 'ok' | 'warning' | 'danger' | 'over';
}

export interface DashboardViewModel {
  readonly nickname: string;
  readonly periodLabel: string;
  readonly balanceMinor: number;
  readonly incomeMinor: number;
  readonly expenseMinor: number;
  readonly budget: BudgetSummaryViewModel;
  readonly report: {
    readonly label: string;
    readonly status: 'ready' | 'stale' | 'pending';
  };
  readonly topMerchant: {
    readonly name: string;
    readonly amountMinor: number;
  } | null;
  readonly todayReceipt: {
    readonly transactionCount: number;
    readonly expenseMinor: number;
  };
}

export type TransactionSubmission =
  | { readonly mode: 'quick'; readonly text: string }
  | { readonly mode: 'direct'; readonly amountMinor: number; readonly memo: string };

export interface RuntimeSnapshot {
  readonly access: AccessState;
  readonly dashboard: DashboardViewModel;
}

export interface AppRuntimePorts {
  createProfile(input: { readonly nickname: string; readonly pin: string }): Promise<void | { readonly recoveryKey: string }>;
  unlock(pin: string): Promise<void>;
  submitTransaction(input: TransactionSubmission): Promise<void>;
  lock?(): void;
  getSnapshot?(): RuntimeSnapshot;
  subscribe?(listener: (snapshot: RuntimeSnapshot) => void): () => void;
}

export const emptyDashboard: DashboardViewModel = {
  nickname: '',
  periodLabel: '이번 달',
  balanceMinor: 0,
  incomeMinor: 0,
  expenseMinor: 0,
  budget: { usagePercent: 0, remainingMinor: 0, status: 'ok' },
  report: { label: '월간 리포트', status: 'pending' },
  topMerchant: null,
  todayReceipt: { transactionCount: 0, expenseMinor: 0 },
};

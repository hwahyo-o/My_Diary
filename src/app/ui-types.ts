import type { AccountKind, AccountPurpose } from '../domain/accounts/types';
import type { ReportType, Confidence } from '../domain/reports/types';

export type AccessState = 'onboarding' | 'locked' | 'unlocked';
export type AppPage = 'home' | 'calendar' | 'stats' | 'assets' | 'settings';

export interface BudgetSummaryViewModel {
  readonly limitMinor: number;
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

export interface AccountViewModel {
  readonly id: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly purpose: AccountPurpose | null;
  readonly balanceMinor: number;
  readonly includeNetWorth: boolean;
}

export interface LoanViewModel {
  readonly id: string;
  readonly accountId: string;
  readonly remainingPrincipalMinor: number;
  readonly annualInterestRate: number;
}

export interface HoldingInsightViewModel {
  readonly holdingId: string;
  readonly accountId: string;
  readonly ticker: string;
  readonly marketValueMinor: number;
  readonly unrealizedChangeMinor: number;
  readonly returnPercent: number;
  readonly freshness: 'fresh' | 'stale';
  readonly tone: 'gain' | 'loss' | 'flat';
  readonly reason: string;
}

export interface AssetsViewModel {
  readonly netWorthMinor: number;
  readonly valuationLabel: string;
  readonly accounts: readonly AccountViewModel[];
  readonly loans: readonly LoanViewModel[];
  readonly holdings: readonly HoldingInsightViewModel[];
  readonly accountPurpose: {
    readonly totalAssetBalanceMinor: number;
    readonly purposeCoverage: number;
    readonly byPurpose: Readonly<Record<AccountPurpose, number>>;
  };
}

export interface ReportSummaryViewModel {
  readonly type: ReportType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly confidence: Confidence;
  readonly incomeMinor: number;
  readonly expenseMinor: number;
  readonly netCashflowMinor: number;
}

export interface AnalyticsViewModel {
  readonly fixedMinor: number;
  readonly variableMinor: number;
  readonly mixedMinor: number;
  readonly reports: readonly ReportSummaryViewModel[];
}

export interface BackupStatusViewModel {
  readonly lastExportedAt: string | null;
  readonly reminderDue: boolean;
}

export interface VaultImportInspectionViewModel {
  readonly newRecords: number;
  readonly updatedRecords: number;
  readonly localOnlyRecords: number;
  readonly sameRecords: number;
  readonly conflicts: number;
}

export type TransactionSubmission =
  | { readonly mode: 'quick'; readonly text: string }
  | { readonly mode: 'direct'; readonly amountMinor: number; readonly memo: string };

export interface SaveAccountInput {
  readonly name: string;
  readonly kind: AccountKind;
  readonly purpose: AccountPurpose;
  readonly balanceMinor: number;
  readonly includeNetWorth: boolean;
}

export interface SaveHoldingInput {
  readonly accountId: string;
  readonly ticker: string;
  readonly quantity: string;
  readonly avgCostMinor: number;
  readonly marketValueMinor: number;
  readonly priceAsOf: string;
}

export interface SaveLoanInput {
  readonly accountId: string;
  readonly remainingPrincipalMinor: number;
  readonly annualInterestRate: number;
}

export interface RuntimeSnapshot {
  readonly access: AccessState;
  readonly dashboard: DashboardViewModel;
  readonly assets: AssetsViewModel;
  readonly analytics: AnalyticsViewModel;
}

export interface AppRuntimePorts {
  createProfile(input: { readonly nickname: string; readonly pin: string }): Promise<void | { readonly recoveryKey: string }>;
  unlock(pin: string): Promise<void>;
  submitTransaction(input: TransactionSubmission): Promise<void>;
  saveBudget?(input: { readonly limitMinor: number }): Promise<void>;
  saveAccount?(input: SaveAccountInput): Promise<string>;
  saveHolding?(input: SaveHoldingInput): Promise<void>;
  saveLoan?(input: SaveLoanInput): Promise<void>;
  exportVault?(input: { readonly recoveryKey: string }): Promise<Uint8Array>;
  inspectVaultImport?(bytes: Uint8Array, input: { readonly recoveryKey: string }): Promise<VaultImportInspectionViewModel>;
  applyVaultImport?(bytes: Uint8Array, input: { readonly recoveryKey: string }): Promise<void>;
  recoverFromVault?(input: { readonly packageBytes: Uint8Array; readonly recoveryKey: string; readonly pin: string }): Promise<void>;
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
  budget: { limitMinor: 0, usagePercent: 0, remainingMinor: 0, status: 'ok' },
  report: { label: '월간 리포트', status: 'pending' },
  topMerchant: null,
  todayReceipt: { transactionCount: 0, expenseMinor: 0 },
};

const emptyPurpose: Record<AccountPurpose, number> = {
  daily: 0,
  'fixed-cost': 0,
  saving: 0,
  emergency: 0,
  investment: 0,
  other: 0,
};

export const emptyAssets: AssetsViewModel = {
  netWorthMinor: 0,
  valuationLabel: '평가 정보 없음',
  accounts: [],
  loans: [],
  holdings: [],
  accountPurpose: {
    totalAssetBalanceMinor: 0,
    purposeCoverage: 0,
    byPurpose: emptyPurpose,
  },
};

export const emptyAnalytics: AnalyticsViewModel = {
  fixedMinor: 0,
  variableMinor: 0,
  mixedMinor: 0,
  reports: [],
};

export const defaultBackupStatus: BackupStatusViewModel = {
  lastExportedAt: null,
  reminderDue: true,
};

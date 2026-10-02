import type { AccountKind, AccountPurpose } from '../domain/accounts/types';
import type { TransactionType } from '../domain/transactions/types';

export type AccessState = 'onboarding' | 'locked' | 'unlocked';
export type AppPage = 'home' | 'calendar' | 'stats' | 'assets' | 'settings';

export interface BudgetSummaryViewModel {
  readonly limitMinor: number;
  readonly usagePercent: number;
  readonly remainingMinor: number;
  readonly status: 'ok' | 'warning' | 'danger' | 'over';
}

export interface TransactionSummaryViewModel {
  readonly id: string;
  readonly type: TransactionType;
  readonly amountMinor: number;
  readonly occurredAt: string;
  readonly memo: string;
  readonly merchant: string;
}

export interface AccountSummaryViewModel {
  readonly id: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly purpose: AccountPurpose;
  readonly balanceMinor: number;
}

export interface HoldingSummaryViewModel {
  readonly id: string;
  readonly accountId: string;
  readonly ticker: string;
  readonly marketValueMinor: number;
  readonly unrealizedGainMinor: number;
  readonly returnPercent: number;
  readonly reason: string;
  readonly priceAsOf: string;
}

export interface PurposeSummaryViewModel {
  readonly purpose: AccountPurpose;
  readonly balanceMinor: number;
  readonly sharePercent: number;
}

export interface AssetsSummaryViewModel {
  readonly netWorthMinor: number;
  readonly valuationLabel: string;
  readonly accounts: readonly AccountSummaryViewModel[];
  readonly holdings: readonly HoldingSummaryViewModel[];
  readonly purposes: readonly PurposeSummaryViewModel[];
}

export interface ReportSummaryViewModel {
  readonly type: 'month_end' | 'half_year' | 'year_end';
  readonly label: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly netCashflowMinor: number;
  readonly confidence: 'low' | 'medium' | 'high';
  readonly status: 'ready' | 'pending';
}

export interface DashboardViewModel {
  readonly nickname: string;
  readonly periodLabel: string;
  readonly balanceMinor: number;
  readonly incomeMinor: number;
  readonly expenseMinor: number;
  readonly fixedMinor: number;
  readonly variableMinor: number;
  readonly budget: BudgetSummaryViewModel;
  readonly report: {
    readonly label: string;
    readonly status: 'ready' | 'stale' | 'pending';
  };
  readonly reports: readonly ReportSummaryViewModel[];
  readonly transactions: readonly TransactionSummaryViewModel[];
  readonly assets: AssetsSummaryViewModel;
  readonly topMerchant: {
    readonly name: string;
    readonly amountMinor: number;
  } | null;
  readonly todayReceipt: {
    readonly transactionCount: number;
    readonly expenseMinor: number;
  };
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
  | {
      readonly mode: 'direct';
      readonly type?: TransactionType;
      readonly accountId?: string;
      readonly counterAccountId?: string;
      readonly amountMinor: number;
      readonly memo: string;
      readonly principalMinor?: number;
      readonly interestMinor?: number;
      readonly feeMinor?: number;
    };

export interface RuntimeSnapshot {
  readonly access: AccessState;
  readonly dashboard: DashboardViewModel;
}

export interface AppRuntimePorts {
  createProfile(input: { readonly nickname: string; readonly pin: string }): Promise<void | { readonly recoveryKey: string }>;
  unlock(pin: string): Promise<void>;
  submitTransaction(input: TransactionSubmission): Promise<void>;
  saveAccount?(input: {
    readonly name: string;
    readonly kind: AccountKind;
    readonly purpose: AccountPurpose;
    readonly openingBalanceMinor: number;
    readonly includeNetWorth: boolean;
  }): Promise<string>;
  saveHolding?(input: {
    readonly accountId: string;
    readonly ticker: string;
    readonly quantity: string;
    readonly avgCostMinor: number;
    readonly marketValueMinor: number;
    readonly priceAsOf: string;
  }): Promise<string>;
  setMonthlyBudget?(limitMinor: number): Promise<void>;
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
  fixedMinor: 0,
  variableMinor: 0,
  budget: { limitMinor: 0, usagePercent: 0, remainingMinor: 0, status: 'ok' },
  report: { label: '월간 리포트', status: 'pending' },
  reports: [],
  transactions: [],
  assets: { netWorthMinor: 0, valuationLabel: '평가 정보 없음', accounts: [], holdings: [], purposes: [] },
  topMerchant: null,
  todayReceipt: { transactionCount: 0, expenseMinor: 0 },
};

export const defaultBackupStatus: BackupStatusViewModel = {
  lastExportedAt: null,
  reminderDue: true,
};

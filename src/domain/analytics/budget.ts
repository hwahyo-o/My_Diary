import type { Budget } from '../budgets/types';
import type { ISODate } from '../shared/types';
import type { Transaction } from '../transactions/types';
import { getIncomeExpenseImpact } from '../transactions/accounting';

export type BudgetStatus = 'ok' | 'warning' | 'danger' | 'over';

export interface BudgetUsage {
  readonly eligibleExpenseMinor: number;
  readonly limitMinor: number;
  readonly usagePercent: number;
  readonly remainingMinor: number;
  readonly status: BudgetStatus;
  readonly timeProgress?: number;
  readonly paceGap?: number;
  readonly earlyDepletion: boolean;
}

function statusFor(usagePercent: number, thresholds: readonly number[]): BudgetStatus {
  const [warning = 50, danger = 80, over = 100] = thresholds;
  if (usagePercent >= over) return 'over';
  if (usagePercent >= danger) return 'danger';
  if (usagePercent >= warning) return 'warning';
  return 'ok';
}

export function selectBudgetUsage(
  budget: Budget,
  transactions: readonly Transaction[],
  timeProgress?: number,
): BudgetUsage {
  const eligibleExpenseMinor = transactions
    .filter((transaction) => !transaction.deletedAt)
    .reduce((sum, transaction) => sum + getIncomeExpenseImpact(transaction).expenseMinor, 0);

  const usagePercent = budget.limitMinor > 0 ? (eligibleExpenseMinor / budget.limitMinor) * 100 : 0;
  const paceGap = timeProgress === undefined ? undefined : usagePercent - timeProgress;
  const earlyDepletion = timeProgress !== undefined && usagePercent >= 50 && (paceGap ?? 0) >= 15;

  return {
    eligibleExpenseMinor,
    limitMinor: budget.limitMinor,
    usagePercent,
    remainingMinor: budget.limitMinor - eligibleExpenseMinor,
    status: statusFor(usagePercent, budget.alertPercents),
    ...(timeProgress === undefined ? {} : { timeProgress, paceGap }),
    earlyDepletion,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function selectTimeProgress(monthStart: ISODate, today: ISODate): number {
  const [year, month] = monthStart.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  if (year === undefined || month === undefined || todayYear === undefined || todayMonth === undefined || todayDay === undefined) return 0;

  const monthKey = year * 12 + month;
  const todayKey = todayYear * 12 + todayMonth;
  if (todayKey < monthKey) return 0;
  if (todayKey > monthKey) return 100;

  return Math.min(100, Math.max(0, (todayDay / daysInMonth(year, month)) * 100));
}

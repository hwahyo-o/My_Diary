import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';
import type {
  AnalyticsViewModel,
  AssetsViewModel,
  CalendarViewModel,
  DashboardViewModel,
} from '../app/ui-types';

const dashboard: DashboardViewModel = {
  nickname: '화효',
  periodLabel: '2026년 10월',
  balanceMinor: 70000,
  incomeMinor: 120000,
  expenseMinor: 50000,
  budget: {
    limitMinor: 100000,
    usagePercent: 50,
    remainingMinor: 50000,
    status: 'warning',
  },
  report: { label: '월간 리포트', status: 'stale' },
  topMerchant: { name: '테스트 카페', amountMinor: 18000 },
  todayReceipt: { transactionCount: 2, expenseMinor: 9000 },
};

const analytics: AnalyticsViewModel = {
  fixedMinor: 20000,
  variableMinor: 25000,
  mixedMinor: 5000,
  reports: [],
};

const assets: AssetsViewModel = {
  netWorthMinor: 1250000,
  valuationLabel: '2026.10.13 기준',
  accounts: [],
  loans: [],
  holdings: [
    {
      holdingId: 'holding-1',
      accountId: 'account-1',
      ticker: 'TEST',
      marketValueMinor: 100000,
      unrealizedChangeMinor: 1000,
      returnPercent: 1,
      freshness: 'stale',
      tone: 'gain',
      reason: 'test',
    },
  ],
  accountPurpose: {
    totalAssetBalanceMinor: 1250000,
    purposeCoverage: 100,
    byPurpose: {
      daily: 0,
      'fixed-cost': 0,
      saving: 0,
      emergency: 0,
      investment: 1250000,
      other: 0,
    },
  },
};

const calendar: CalendarViewModel = {
  transactions: [
    {
      id: 'transaction-1',
      occurredAt: '2026-10-13T01:00:00.000Z',
      label: '점심',
      type: 'expense',
      amountMinor: 4500,
      direction: 'expense',
    },
  ],
};

describe('HomePage operational dashboard', () => {
  it('prioritizes cash flow, attention items, KPIs, spending mix, and recent activity', () => {
    render(
      <HomePage
        dashboard={dashboard}
        analytics={analytics}
        assets={assets}
        calendar={calendar}
        onQuickAdd={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '화효님의 재무 운영 현황' })).toBeInTheDocument();
    expect(screen.getByText('이번 달 순현금흐름')).toBeInTheDocument();
    expect(screen.getByText('₩70,000')).toBeInTheDocument();
    expect(screen.getAllByText('예산 주의').length).toBeGreaterThan(0);
    expect(screen.getByText('리포트 재생성 필요')).toBeInTheDocument();
    expect(screen.getByText('자산 평가 업데이트 필요')).toBeInTheDocument();
    expect(screen.getByText('₩1,250,000')).toBeInTheDocument();
    expect(screen.getByText('지출 구조')).toBeInTheDocument();
    expect(screen.getByText('점심')).toBeInTheDocument();
  });

  it('opens the transaction flow from the primary action', () => {
    const onQuickAdd = vi.fn();

    render(
      <HomePage
        dashboard={dashboard}
        analytics={analytics}
        assets={assets}
        calendar={calendar}
        onQuickAdd={onQuickAdd}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '거래 추가' }));
    expect(onQuickAdd).toHaveBeenCalledTimes(1);
  });

  it('shows an all-clear state when no attention items are present', () => {
    render(
      <HomePage
        dashboard={{
          ...dashboard,
          budget: { ...dashboard.budget, status: 'ok', usagePercent: 20 },
          report: { ...dashboard.report, status: 'ready' },
        }}
        analytics={analytics}
        assets={{ ...assets, holdings: [] }}
        calendar={{ transactions: [] }}
        onQuickAdd={vi.fn()}
      />,
    );

    expect(screen.getByText('현재 우선 조치가 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('아직 거래가 없습니다.')).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { AssetsPage } from './AssetsPage';
import { StatsPage } from './StatsPage';
import type { AnalyticsViewModel, AssetsViewModel, BudgetSummaryViewModel } from '../app/ui-types';

const budget: BudgetSummaryViewModel = {
  limitMinor: 1_000_000,
  usagePercent: 25,
  remainingMinor: 750_000,
  status: 'ok',
};

const analytics: AnalyticsViewModel = {
  fixedMinor: 200_000,
  variableMinor: 50_000,
  mixedMinor: 0,
  reports: [
    { type: 'month_start', periodStart: '2026-10-01', periodEnd: '2026-10-31', confidence: 'high', incomeMinor: 0, expenseMinor: 250_000, netCashflowMinor: -250_000 },
    { type: 'month_end', periodStart: '2026-10-01', periodEnd: '2026-10-31', confidence: 'high', incomeMinor: 0, expenseMinor: 250_000, netCashflowMinor: -250_000 },
    { type: 'half_year', periodStart: '2026-07-01', periodEnd: '2026-12-31', confidence: 'medium', incomeMinor: 0, expenseMinor: 250_000, netCashflowMinor: -250_000 },
    { type: 'year_end', periodStart: '2026-01-01', periodEnd: '2026-12-31', confidence: 'medium', incomeMinor: 0, expenseMinor: 250_000, netCashflowMinor: -250_000 },
  ],
};

const assets: AssetsViewModel = {
  netWorthMinor: 720_000,
  valuationLabel: '평가값 최신',
  accounts: [
    { id: '11111111-1111-4111-8111-111111111111', name: '생활비 통장', kind: 'checking', purpose: 'daily', balanceMinor: 800_000, includeNetWorth: true },
    { id: '22222222-2222-4222-8222-222222222222', name: '투자 계좌', kind: 'brokerage', purpose: 'investment', balanceMinor: 100_000, includeNetWorth: true },
    { id: '33333333-3333-4333-8333-333333333333', name: '학자금 대출', kind: 'loan', purpose: 'other', balanceMinor: 0, includeNetWorth: true },
  ],
  loans: [
    { id: '44444444-4444-4444-8444-444444444444', accountId: '33333333-3333-4333-8333-333333333333', remainingPrincipalMinor: 300_000, annualInterestRate: 3.5 },
  ],
  holdings: [
    {
      holdingId: '55555555-5555-4555-8555-555555555555',
      accountId: '22222222-2222-4222-8222-222222222222',
      ticker: 'ABC',
      marketValueMinor: 120_000,
      unrealizedChangeMinor: 20_000,
      returnPercent: 20,
      freshness: 'fresh',
      tone: 'gain',
      reason: '평가손익 +20,000원 (20.0%), 가격 기준일 2026-10-01 · 5일 경과.',
    },
  ],
  accountPurpose: {
    totalAssetBalanceMinor: 900_000,
    purposeCoverage: 1,
    byPurpose: { daily: 800_000, 'fixed-cost': 0, saving: 0, emergency: 0, investment: 100_000, other: 0 },
  },
};

describe('MVP finance pages', () => {
  it('shows all four reports and saves a monthly budget from Stats', () => {
    const onSaveBudget = vi.fn().mockResolvedValue(undefined);
    render(
      <StatsPage
        incomeMinor={0}
        expenseMinor={250_000}
        budget={budget}
        analytics={analytics}
        onSaveBudget={onSaveBudget}
      />,
    );

    expect(screen.getByText('월초 리포트')).toBeInTheDocument();
    expect(screen.getByText('월말 리포트')).toBeInTheDocument();
    expect(screen.getByText('반기 리포트')).toBeInTheDocument();
    expect(screen.getByText('연말 리포트')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('월 예산'), { target: { value: '1200000' } });
    fireEvent.click(screen.getByRole('button', { name: '예산 저장' }));
    expect(onSaveBudget).toHaveBeenCalledWith({ limitMinor: 1_200_000 });
  });

  it('shows real asset analysis and exposes account, holding, and loan entry flows', () => {
    const onSaveAccount = vi.fn().mockResolvedValue('new-account');
    const onSaveHolding = vi.fn().mockResolvedValue(undefined);
    const onSaveLoan = vi.fn().mockResolvedValue(undefined);

    render(
      <AssetsPage
        assets={assets}
        onSaveAccount={onSaveAccount}
        onSaveHolding={onSaveHolding}
        onSaveLoan={onSaveLoan}
      />,
    );

    expect(screen.getByText('₩720,000')).toBeInTheDocument();
    expect(screen.getByText('생활비 통장')).toBeInTheDocument();
    expect(screen.getByText('목적 지정률 100%')).toBeInTheDocument();
    expect(screen.getByText('ABC')).toBeInTheDocument();
    expect(screen.getByText(/평가손익 \+20,000원/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('계좌 이름'), { target: { value: '비상금' } });
    fireEvent.change(screen.getByLabelText('계좌 잔액'), { target: { value: '500000' } });
    fireEvent.click(screen.getByRole('button', { name: '계좌 추가' }));
    expect(onSaveAccount).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('보유 종목'), { target: { value: 'XYZ' } });
    fireEvent.change(screen.getByLabelText('수량'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('평균 단가'), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText('평가 금액'), { target: { value: '22000' } });
    fireEvent.change(screen.getByLabelText('가격 기준일'), { target: { value: '2026-10-06' } });
    fireEvent.click(screen.getByRole('button', { name: '보유종목 추가' }));
    expect(onSaveHolding).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('대출 원금'), { target: { value: '200000' } });
    fireEvent.change(screen.getByLabelText('연 이자율'), { target: { value: '3.2' } });
    fireEvent.click(screen.getByRole('button', { name: '대출 추가' }));
    expect(onSaveLoan).toHaveBeenCalled();
  });
});

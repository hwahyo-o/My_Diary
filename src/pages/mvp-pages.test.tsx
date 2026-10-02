import { render, screen } from '@testing-library/react';
import { CalendarPage } from './CalendarPage';
import { AssetsPage } from './AssetsPage';

describe('MVP data pages', () => {
  it('renders stored transaction summaries by date', () => {
    render(<CalendarPage transactions={[{
      id: 'tx-1',
      type: 'expense',
      amountMinor: 13_000,
      occurredAt: '2026-10-15T03:00:00.000Z',
      memo: '점심',
      merchant: '식당',
    }]} />);

    expect(screen.getByLabelText('조회 날짜')).toHaveValue('2026-10-15');
    expect(screen.getByText('식당')).toBeInTheDocument();
    expect(screen.getByText('₩13,000')).toBeInTheDocument();
  });

  it('renders account, holding, net-worth, purpose, and budget values', () => {
    render(<AssetsPage
      assets={{
        netWorthMinor: 1_780_000,
        valuationLabel: '투자 평가 기준 2026-10-15',
        accounts: [{ id: 'a-1', name: '비상금 통장', kind: 'savings', purpose: 'emergency', balanceMinor: 500_000 }],
        holdings: [{ id: 'h-1', accountId: 'a-2', ticker: 'TEST', marketValueMinor: 120_000, unrealizedGainMinor: 20_000, returnPercent: 20, reason: '현재 시장가치가 원가보다 높습니다.', priceAsOf: '2026-10-15' }],
        purposes: [{ purpose: 'emergency', balanceMinor: 500_000, sharePercent: 50 }],
      }}
      budget={{ limitMinor: 100_000, usagePercent: 40, remainingMinor: 60_000, status: 'ok' }}
    />);

    expect(screen.getByText('₩1,780,000')).toBeInTheDocument();
    expect(screen.getByText('비상금 통장')).toBeInTheDocument();
    expect(screen.getByText(/TEST/)).toBeInTheDocument();
    expect(screen.getByText(/20\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/현재 사용률 40\.0%/)).toBeInTheDocument();
  });
});

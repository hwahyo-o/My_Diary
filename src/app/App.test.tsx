import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { App } from './App';
import { emptyDashboard, type RuntimeSnapshot } from './ui-types';

const dashboard = {
  nickname: '예현',
  periodLabel: '2026년 10월',
  balanceMinor: 1_250_000,
  incomeMinor: 3_000_000,
  expenseMinor: 1_750_000,
  budget: { usagePercent: 58, remainingMinor: 420_000, status: 'warning' as const },
  report: { label: '10월 월간 리포트', status: 'ready' as const },
  topMerchant: { name: '카페 봄', amountMinor: 84_000 },
  todayReceipt: { transactionCount: 3, expenseMinor: 42_000 },
};

describe('App protected shell', () => {
  it('renders supplied Home view-model values without recomputing finance logic', () => {
    render(<App initialAccess="unlocked" dashboard={dashboard} />);

    expect(screen.getByRole('heading', { name: '안녕하세요, 예현님' })).toBeInTheDocument();
    expect(screen.getByText('₩1,250,000')).toBeInTheDocument();
    expect(screen.getByText('58%')).toBeInTheDocument();
    expect(screen.getByText('카페 봄')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '홈' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens Quick Add and navigates all five protected pages', () => {
    render(
      <App
        initialAccess="unlocked"
        dashboard={dashboard}
        runtime={{
          createProfile: vi.fn().mockResolvedValue(undefined),
          unlock: vi.fn().mockResolvedValue(undefined),
          submitTransaction: vi.fn().mockResolvedValue(undefined),
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '거래 추가' }));
    expect(screen.getByRole('dialog', { name: '거래 추가' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    fireEvent.click(screen.getByRole('button', { name: '캘린더' }));
    expect(screen.getByRole('heading', { name: '캘린더' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '캘린더' })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: '통계' }));
    expect(screen.getByRole('heading', { name: '통계' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '자산' }));
    expect(screen.getByRole('heading', { name: '자산' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByRole('heading', { name: '설정' })).toBeInTheDocument();
  });

  it('subscribes to runtime snapshots and explicit lock returns to the unlock screen', () => {
    let listener: ((snapshot: RuntimeSnapshot) => void) | undefined;
    const lock = vi.fn();
    const runtime = {
      createProfile: vi.fn().mockResolvedValue(undefined),
      unlock: vi.fn().mockResolvedValue(undefined),
      submitTransaction: vi.fn().mockResolvedValue(undefined),
      lock,
      getSnapshot: () => ({ access: 'unlocked' as const, dashboard }),
      subscribe: (next: (snapshot: RuntimeSnapshot) => void) => {
        listener = next;
        return () => { listener = undefined; };
      },
    };

    render(<App runtime={runtime} />);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    fireEvent.click(screen.getByRole('button', { name: '지금 잠그기' }));
    expect(lock).toHaveBeenCalledTimes(1);

    act(() => listener?.({ access: 'locked', dashboard: emptyDashboard }));
    expect(screen.getByRole('heading', { name: 'My Diary 잠금 해제' })).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './CalendarPage';
import type { CalendarViewModel } from '../app/ui-types';

const calendar: CalendarViewModel = {
  transactions: [
    {
      id: 'expense-1',
      occurredAt: '2026-10-13T03:30:00.000Z',
      label: '점심',
      type: 'expense',
      amountMinor: 4500,
      direction: 'expense',
    },
    {
      id: 'income-1',
      occurredAt: '2026-10-14T01:00:00.000Z',
      label: '급여',
      type: 'income',
      amountMinor: 100000,
      direction: 'income',
    },
  ],
};

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T12:00:00+09:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows monthly totals and the selected day ledger', () => {
    render(<CalendarPage calendar={calendar} onQuickAdd={vi.fn()} />);

    expect(screen.getByText('2026년 10월')).toBeInTheDocument();
    expect(screen.getByText('₩100,000')).toBeInTheDocument();
    expect(screen.getAllByText('₩4,500').length).toBeGreaterThan(0);
    expect(screen.getByText('점심')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('gridcell', { name: /10월 14일.*거래 1건/ }));
    expect(screen.getByText('급여')).toBeInTheDocument();
    expect(screen.getByText('+₩100,000')).toBeInTheDocument();
  });

  it('moves between months and returns to today', () => {
    render(<CalendarPage calendar={calendar} onQuickAdd={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByText('2026년 11월')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    expect(screen.getByText('2026년 10월')).toBeInTheDocument();
  });

  it('opens the existing transaction entry flow from the calendar', () => {
    const onQuickAdd = vi.fn();
    render(<CalendarPage calendar={calendar} onQuickAdd={onQuickAdd} />);

    fireEvent.click(screen.getByRole('button', { name: '거래 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '새 거래 입력' }));

    expect(onQuickAdd).toHaveBeenCalledTimes(2);
  });
});

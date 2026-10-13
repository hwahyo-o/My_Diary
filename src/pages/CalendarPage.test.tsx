import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const mutationProps = {
  onUpdateTransaction: vi.fn().mockResolvedValue(undefined),
  onDeleteTransaction: vi.fn().mockResolvedValue(undefined),
  onRestoreTransaction: vi.fn().mockResolvedValue(undefined),
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
    render(<CalendarPage calendar={calendar} onQuickAdd={vi.fn()} {...mutationProps} />);

    expect(screen.getByText('2026년 10월')).toBeInTheDocument();
    expect(screen.getByText('₩100,000')).toBeInTheDocument();
    expect(screen.getAllByText('₩4,500').length).toBeGreaterThan(0);
    expect(screen.getByText('점심')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('gridcell', { name: /10월 14일.*거래 1건/ }));
    expect(screen.getByText('급여')).toBeInTheDocument();
    expect(screen.getAllByText('+₩100,000').length).toBeGreaterThan(0);
  });

  it('moves between months and returns to today', () => {
    render(<CalendarPage calendar={calendar} onQuickAdd={vi.fn()} {...mutationProps} />);

    fireEvent.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByText('2026년 11월')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    expect(screen.getByText('2026년 10월')).toBeInTheDocument();
  });

  it('edits an existing transaction from the selected day', async () => {
    const onUpdateTransaction = vi.fn().mockResolvedValue(undefined);
    render(<CalendarPage calendar={calendar} onQuickAdd={vi.fn()} {...mutationProps} onUpdateTransaction={onUpdateTransaction} />);

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('거래 내용 수정'), { target: { value: '수정된 점심' } });
    fireEvent.change(screen.getByLabelText('거래 금액 수정'), { target: { value: '5500' } });
    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }));

    await waitFor(() => expect(onUpdateTransaction).toHaveBeenCalledTimes(1));
    expect(onUpdateTransaction.mock.calls[0]?.[0]).toMatchObject({
      id: 'expense-1',
      amountMinor: 5500,
      label: '수정된 점심',
    });
  });

  it('requires delete confirmation and can restore the most recently deleted transaction', async () => {
    const onDeleteTransaction = vi.fn().mockResolvedValue(undefined);
    const onRestoreTransaction = vi.fn().mockResolvedValue(undefined);
    render(
      <CalendarPage
        calendar={calendar}
        onQuickAdd={vi.fn()}
        {...mutationProps}
        onDeleteTransaction={onDeleteTransaction}
        onRestoreTransaction={onRestoreTransaction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onDeleteTransaction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '삭제 확인' }));

    await waitFor(() => expect(onDeleteTransaction).toHaveBeenCalledWith('expense-1'));
    fireEvent.click(screen.getByRole('button', { name: '삭제 취소' }));
    await waitFor(() => expect(onRestoreTransaction).toHaveBeenCalledWith('expense-1'));
  });

  it('opens the existing transaction entry flow from the calendar', () => {
    const onQuickAdd = vi.fn();
    render(<CalendarPage calendar={calendar} onQuickAdd={onQuickAdd} {...mutationProps} />);

    fireEvent.click(screen.getByRole('button', { name: '거래 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '새 거래 입력' }));

    expect(onQuickAdd).toHaveBeenCalledTimes(2);
  });
});

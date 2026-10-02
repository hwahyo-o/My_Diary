import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TransactionEntrySheet } from './TransactionEntrySheet';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onSubmitTransaction: vi.fn(),
};

describe('TransactionEntrySheet', () => {
  it('submits Quick and Direct input through one callback boundary', () => {
    const onSubmitTransaction = vi.fn();
    render(<TransactionEntrySheet {...baseProps} onSubmitTransaction={onSubmitTransaction} />);

    fireEvent.change(screen.getByLabelText('빠른 입력'), { target: { value: '점심 만삼천' } });
    fireEvent.click(screen.getByRole('button', { name: '빠른 입력 저장' }));
    expect(onSubmitTransaction).toHaveBeenCalledWith({ mode: 'quick', text: '점심 만삼천' });

    fireEvent.click(screen.getByRole('button', { name: '직접 입력' }));
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '13000' } });
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '점심' } });
    fireEvent.click(screen.getByRole('button', { name: '직접 입력 저장' }));

    expect(onSubmitTransaction).toHaveBeenLastCalledWith({ mode: 'direct', amountMinor: 13000, memo: '점심' });
  });

  it('submits a selected non-expense transaction type', () => {
    const onSubmitTransaction = vi.fn();
    render(<TransactionEntrySheet {...baseProps} onSubmitTransaction={onSubmitTransaction} />);
    fireEvent.click(screen.getByRole('button', { name: '직접 입력' }));
    fireEvent.change(screen.getByLabelText('거래 유형'), { target: { value: 'income' } });
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '1000000' } });
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '급여' } });
    fireEvent.click(screen.getByRole('button', { name: '직접 입력 저장' }));

    expect(onSubmitTransaction).toHaveBeenCalledWith({ mode: 'direct', type: 'income', amountMinor: 1000000, memo: '급여' });
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<TransactionEntrySheet {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

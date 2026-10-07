import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { TransactionEntrySheet } from './TransactionEntrySheet';

describe('TransactionEntrySheet', () => {
  it('awaits Quick and Direct saves, then closes after success', async () => {
    const onClose = vi.fn();
    const onSubmitTransaction = vi.fn().mockResolvedValue(undefined);
    render(
      <TransactionEntrySheet
        open
        onClose={onClose}
        onSubmitTransaction={onSubmitTransaction}
      />,
    );

    fireEvent.change(screen.getByLabelText('빠른 입력'), { target: { value: '점심 13,000원' } });
    fireEvent.click(screen.getByRole('button', { name: '빠른 입력 저장' }));

    await waitFor(() => expect(onSubmitTransaction).toHaveBeenCalledWith({ mode: 'quick', text: '점심 13,000원' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '직접 입력' }));
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '13000' } });
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '점심' } });
    fireEvent.click(screen.getByRole('button', { name: '직접 입력 저장' }));

    await waitFor(() => expect(onSubmitTransaction).toHaveBeenLastCalledWith({ mode: 'direct', amountMinor: 13000, memo: '점심' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows a visible error and stays open when persistence fails', async () => {
    const onClose = vi.fn();
    const onSubmitTransaction = vi.fn().mockRejectedValue(new Error('storage failed'));
    render(
      <TransactionEntrySheet
        open
        onClose={onClose}
        onSubmitTransaction={onSubmitTransaction}
      />,
    );

    fireEvent.change(screen.getByLabelText('빠른 입력'), { target: { value: '점심 3,000원' } });
    fireEvent.click(screen.getByRole('button', { name: '빠른 입력 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('거래를 저장하지 못했습니다');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <TransactionEntrySheet
        open
        onClose={onClose}
        onSubmitTransaction={vi.fn()}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

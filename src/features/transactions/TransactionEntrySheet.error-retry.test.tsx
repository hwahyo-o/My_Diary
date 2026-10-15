import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TransactionEntrySheet } from './TransactionEntrySheet';

it('retains corrected batch inputs after failed save and allows a successful retry', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  const close = vi.fn();
  render(<TransactionEntrySheet open onClose={close} onSubmitTransaction={save}
    onPreviewQuickBatch={() => ({
      valid: true,
      entries: [
        { text: '점심 8000원', amountMinor: 8000, occurredAt: '2026-10-14T12:00:00.000+09:00', transactionType: 'expense', categoryId: 'food', categoryLabel: '식비', fixedVariable: 'variable', needsReview: false, unresolvedAmount: false },
        { text: '커피 4500원', amountMinor: 4500, occurredAt: '2026-10-14T12:00:00.000+09:00', transactionType: 'expense', categoryId: 'food', categoryLabel: '식비', fixedVariable: 'variable', needsReview: false, unresolvedAmount: false },
      ],
    })} />);
  fireEvent.change(screen.getByLabelText('빠른 입력'), { target: { value: '점심 8000원; 커피 4500원' } });
  fireEvent.click(screen.getByRole('button', { name: '거래별 수정' }));
  fireEvent.change(screen.getByLabelText('거래 2 금액'), { target: { value: '5500' } });
  fireEvent.click(screen.getByRole('button', { name: '거래 전체 저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('일괄 거래를 저장하지 못했습니다');
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText('거래 2 금액')).toHaveValue(5500);
  fireEvent.click(screen.getByRole('button', { name: '거래 전체 저장' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({
    mode: 'batch',
    entries: expect.arrayContaining([expect.objectContaining({ amountMinor: 5500 })]),
  }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

it('keeps a conflicting Quick Add correction available after a failed save', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  const close = vi.fn();
  render(<TransactionEntrySheet open onClose={close} onSubmitTransaction={save}
    onPreviewQuickTransaction={() => ({
      amountMinor: 12000, occurredAt: '2026-10-15T12:00:00.000+09:00',
      transactionType: 'income', categoryId: 'food', categoryLabel: '식비',
      fixedVariable: 'variable', needsReview: true, unresolvedAmount: false,
    })} />);
  fireEvent.change(screen.getByLabelText('빠른 입력'), { target: { value: '월급으로 점심 12000원' } });
  expect(screen.getByRole('button', { name: '빠른 입력 저장' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '분류 수정' }));
  fireEvent.change(screen.getByLabelText('거래 유형 수정'), { target: { value: 'expense' } });
  fireEvent.click(screen.getByRole('button', { name: '빠른 입력 저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('거래를 저장하지 못했습니다');
  expect(screen.getByLabelText('거래 유형 수정')).toHaveValue('expense');
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '빠른 입력 저장' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({
    mode: 'quick', correction: expect.objectContaining({ transactionType: 'expense' }),
  }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

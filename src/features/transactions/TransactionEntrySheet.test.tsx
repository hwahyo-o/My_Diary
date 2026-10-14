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

  it('shows the same classification result that will be saved', () => {
    render(
      <TransactionEntrySheet
        open
        onClose={vi.fn()}
        onSubmitTransaction={vi.fn()}
        onPreviewQuickTransaction={() => ({
          amountMinor: 4500,
          occurredAt: '2026-10-12T10:00:00.000+09:00',
          transactionType: 'expense',
          categoryId: 'food',
          categoryLabel: '식비',
          fixedVariable: 'variable',
          needsReview: false,
          unresolvedAmount: false,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText('빠른 입력'), { target: { value: '그제 커피 4500' } });

    expect(screen.getByText('자동 분류 미리보기')).toBeInTheDocument();
    expect(screen.getByText('식비')).toBeInTheDocument();
    expect(screen.getByText('변동')).toBeInTheDocument();
    expect(screen.getByText('₩4,500')).toBeInTheDocument();
    expect(screen.getByText('저장 가능')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '빠른 입력 저장' })).toBeEnabled();
  });

  it('blocks saving when the preview reports a classification conflict', () => {
    render(
      <TransactionEntrySheet
        open
        onClose={vi.fn()}
        onSubmitTransaction={vi.fn()}
        onPreviewQuickTransaction={() => ({
          amountMinor: 4500,
          occurredAt: '2026-10-14T10:00:00.000+09:00',
          transactionType: 'expense',
          categoryId: 'uncategorized',
          categoryLabel: '미분류',
          fixedVariable: 'mixed',
          needsReview: true,
          unresolvedAmount: false,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText('빠른 입력'), { target: { value: '충돌 입력 4500' } });

    expect(screen.getByText('확인 필요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '빠른 입력 저장' })).toBeDisabled();
  });

  it('lets the user correct a conflicting classification before saving', async () => {
    const onSubmitTransaction = vi.fn().mockResolvedValue(undefined);
    render(
      <TransactionEntrySheet
        open
        onClose={vi.fn()}
        onSubmitTransaction={onSubmitTransaction}
        onPreviewQuickTransaction={() => ({
          amountMinor: 4500,
          occurredAt: '2026-10-14T10:00:00.000+09:00',
          transactionType: 'expense',
          categoryId: 'uncategorized',
          categoryLabel: '미분류',
          fixedVariable: 'mixed',
          needsReview: true,
          unresolvedAmount: false,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText('빠른 입력'), { target: { value: '충돌 입력 4500' } });
    fireEvent.click(screen.getByRole('button', { name: '분류 수정' }));
    fireEvent.change(screen.getByLabelText('거래 유형 수정'), { target: { value: 'income' } });
    fireEvent.change(screen.getByLabelText('카테고리 수정'), { target: { value: 'food' } });
    fireEvent.change(screen.getByLabelText('고정 변동 수정'), { target: { value: 'variable' } });
    fireEvent.change(screen.getByLabelText('거래 날짜 수정'), { target: { value: '2026-10-13' } });

    expect(screen.getByText('수정 완료')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '빠른 입력 저장' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '빠른 입력 저장' }));

    await waitFor(() => expect(onSubmitTransaction).toHaveBeenCalledWith({
      mode: 'quick',
      text: '충돌 입력 4500',
      correction: {
        transactionType: 'income',
        categoryId: 'food',
        fixedVariable: 'variable',
        occurredAt: '2026-10-13T12:00:00.000+09:00',
      },
    }));
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

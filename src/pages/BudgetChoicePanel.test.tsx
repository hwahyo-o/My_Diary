import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BudgetChoicePanel } from './BudgetChoicePanel';

it('only confirms the selected historical budget and reports success', async () => {
  const onList = vi.fn().mockResolvedValue([
    { id: 'new', limitMinor: 200000, updatedAt: '2026-10-19T05:00:01.000Z' },
    { id: 'old', limitMinor: 100000, updatedAt: '2026-10-19T05:00:00.000Z' },
  ]);
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(<BudgetChoicePanel onList={onList} onConfirm={onConfirm} />);
  fireEvent.click(screen.getByRole('button', { name: '이번 달 예산 기록 조회' }));
  await screen.findByText(/100,000원/);
  expect(screen.getByRole('button', { name: '선택한 예산 적용' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: /100,000원/ }));
  fireEvent.click(screen.getByRole('button', { name: '선택한 예산 적용' }));
  await waitFor(() => expect(onConfirm).toHaveBeenCalledExactlyOnceWith('old'));
  expect(await screen.findByRole('status')).toHaveTextContent('예산 기록이 저장되었습니다');
});

it('does not silently save on failure and requires a fresh lookup', async () => {
  const onList = vi.fn().mockResolvedValue([{ id: 'old', limitMinor: 100000, updatedAt: '2026-10-19T05:00:00.000Z' }]);
  const onConfirm = vi.fn().mockRejectedValue(new Error('stale'));
  render(<BudgetChoicePanel onList={onList} onConfirm={onConfirm} />);
  fireEvent.click(screen.getByRole('button', { name: '이번 달 예산 기록 조회' }));
  await screen.findByText(/100,000원/);
  fireEvent.click(screen.getByRole('radio', { name: /100,000원/ }));
  fireEvent.click(screen.getByRole('button', { name: '선택한 예산 적용' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('다시 조회');
  expect(screen.getByRole('button', { name: '선택한 예산 적용' })).toBeDisabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

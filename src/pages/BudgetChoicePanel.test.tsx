import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BudgetChoicePanel } from './BudgetChoicePanel';

it('only confirms the selected historical budget and reports success', async () => {
  const onList = vi.fn().mockResolvedValue([
    { id: 'new', limitMinor: 200000, updatedAt: '2026-10-19T05:00:01.000Z' },
    { id: 'old', limitMinor: 100000, updatedAt: '2026-10-19T05:00:00.000Z' },
  ]);
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(<BudgetChoicePanel onList={onList} onConfirm={onConfirm} cloudConflict={false} />);
  fireEvent.click(screen.getByRole('button', { name: '이번 달 예산 기록 조회' }));
  await screen.findByText(/100,000원/);
  expect(screen.getByRole('button', { name: '선택한 예산 적용' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: /100,000원/ }));
  fireEvent.click(screen.getByRole('button', { name: '선택한 예산 적용' }));
  await waitFor(() => expect(onConfirm).toHaveBeenCalledExactlyOnceWith('old', 'new'));
  expect(await screen.findByRole('status')).toHaveTextContent('예산 기록이 저장되었습니다');
});

it('does not silently save on failure and requires a fresh lookup', async () => {
  const onList = vi.fn().mockResolvedValue([{ id: 'old', limitMinor: 100000, updatedAt: '2026-10-19T05:00:00.000Z' }]);
  const onConfirm = vi.fn().mockRejectedValue(new Error('stale'));
  render(<BudgetChoicePanel onList={onList} onConfirm={onConfirm} cloudConflict={false} />);
  fireEvent.click(screen.getByRole('button', { name: '이번 달 예산 기록 조회' }));
  await screen.findByText(/100,000원/);
  fireEvent.click(screen.getByRole('radio', { name: /100,000원/ }));
  fireEvent.click(screen.getByRole('button', { name: '선택한 예산 적용' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('다시 조회');
  expect(screen.getByRole('button', { name: '선택한 예산 적용' })).toBeDisabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('blocks confirming a historical budget while cloud synchronization has a conflict', async () => {
  const onList = vi.fn().mockResolvedValue([
    { id: 'past', limitMinor: 100000, updatedAt: '2026-10-19T05:00:00.000Z' },
  ]);
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(<BudgetChoicePanel onList={onList} onConfirm={onConfirm} cloudConflict />);
  fireEvent.click(screen.getByRole('button', { name: '이번 달 예산 기록 조회' }));
  await screen.findByText(/100,000원/);
  fireEvent.click(screen.getByRole('radio', { name: /100,000원/ }));
  expect(screen.getByRole('button', { name: '선택한 예산 적용' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('클라우드 기록 충돌');
  expect(onConfirm).not.toHaveBeenCalled();
});

it('labels differing same-month budget history without claiming a cloud conflict', async () => {
  const onList = vi.fn().mockResolvedValue([
    { id: 'latest', limitMinor: 200000, updatedAt: '2026-10-19T05:00:01.000Z' },
    { id: 'previous', limitMinor: 100000, updatedAt: '2026-10-19T05:00:00.000Z' },
  ]);
  render(<BudgetChoicePanel onList={onList} onConfirm={vi.fn()} cloudConflict={false} />);
  fireEvent.click(screen.getByRole('button', { name: '이번 달 예산 기록 조회' }));
  expect(await screen.findByRole('note')).toHaveTextContent('정상적인 순차 수정');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('does not display differing-value notice for equal monthly budgets', async () => {
  const onList = vi.fn().mockResolvedValue([
    { id: 'latest', limitMinor: 100000, updatedAt: '2026-10-19T05:00:01.000Z' },
    { id: 'previous', limitMinor: 100000, updatedAt: '2026-10-19T05:00:00.000Z' },
  ]);
  render(<BudgetChoicePanel onList={onList} onConfirm={vi.fn()} cloudConflict={false} />);
  fireEvent.click(screen.getByRole('button', { name: '이번 달 예산 기록 조회' }));
  await screen.findAllByText(/100,000원/);
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});

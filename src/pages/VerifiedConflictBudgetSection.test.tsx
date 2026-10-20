import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { VerifiedConflictBudgetSection } from './VerifiedConflictBudgetSection';

const comparison = {
  candidates: [{ recordId: 'synthetic-id', month: '2026-10-01', localLimitMinor: 100000, remoteLimitMinor: 200000 }],
  unresolvedNonBudgetRecordCount: 0,
  unresolvedEventCount: 1,
};
it('only retrieves and displays budget differences after explicit user action', async () => {
  const onPreview = vi.fn().mockResolvedValue(comparison);
  render(<VerifiedConflictBudgetSection onPreview={onPreview} />);
  expect(onPreview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '충돌 예산 비교 조회' }));
  await waitFor(() => expect(screen.getByText('로컬 예산: 100,000원')).toBeInTheDocument());
  expect(screen.getByText('클라우드 예산: 200,000원')).toBeInTheDocument();
  expect(screen.queryByText('synthetic-id')).not.toBeInTheDocument();
  expect(onPreview).toHaveBeenCalledTimes(1);
});
it('erases a previous comparison if a fresh validation fails', async () => {
  const onPreview = vi.fn().mockResolvedValueOnce(comparison).mockRejectedValueOnce(new Error('revision changed'));
  render(<VerifiedConflictBudgetSection onPreview={onPreview} />);
  fireEvent.click(screen.getByRole('button', { name: '충돌 예산 비교 조회' }));
  await screen.findByText('로컬 예산: 100,000원');
  fireEvent.click(screen.getByRole('button', { name: '충돌 예산 비교 조회' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('비교할 수 없습니다');
  expect(screen.queryByText('로컬 예산: 100,000원')).not.toBeInTheDocument();
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CloudBudgetPreviewSection } from './CloudBudgetPreviewSection';

const comparison = {
  local: { latestId: 'a', latestLimitMinor: 100000, recordIds: ['a'] },
  remote: { latestId: 'b', latestLimitMinor: 200000, recordIds: ['b'] },
  sameLatestRecord: false,
  requiresReview: true,
};

it('fetches only after explicit click and displays a read-only comparison', async () => {
  const onPreview = vi.fn().mockResolvedValue(comparison);
  render(<CloudBudgetPreviewSection onPreview={onPreview} />);
  expect(onPreview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '클라우드 예산 비교 조회' }));
  await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1));
  expect(await screen.findByLabelText('클라우드 예산')).toHaveTextContent('200,000원');
  expect(screen.queryByRole('button', { name: /적용|확정|업로드/ })).not.toBeInTheDocument();
});

it('clears previous cloud values when a refresh fails', async () => {
  const onPreview = vi.fn()
    .mockResolvedValueOnce(comparison)
    .mockRejectedValueOnce(new Error('Cloud identity mismatch'));
  render(<CloudBudgetPreviewSection onPreview={onPreview} />);
  fireEvent.click(screen.getByRole('button', { name: '클라우드 예산 비교 조회' }));
  await screen.findByLabelText('클라우드 예산');
  fireEvent.click(screen.getByRole('button', { name: '클라우드 예산 비교 조회' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('비교 자료를 확인하지 못했습니다');
  expect(screen.queryByLabelText('클라우드 예산')).not.toBeInTheDocument();
});

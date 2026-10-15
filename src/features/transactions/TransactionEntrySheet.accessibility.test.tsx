import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TransactionEntrySheet } from './TransactionEntrySheet';

it('closes via Escape and returns focus to the invoking button', () => {
  const opener = document.createElement('button');
  opener.textContent = '거래 추가';
  document.body.appendChild(opener);
  const close = vi.fn();
  const { rerender, unmount } = render(<TransactionEntrySheet open onClose={close} onSubmitTransaction={vi.fn()} returnFocusTo={opener} />);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(close).toHaveBeenCalledTimes(1);
  rerender(<TransactionEntrySheet open={false} onClose={close} onSubmitTransaction={vi.fn()} returnFocusTo={opener} />);
  expect(document.activeElement).toBe(opener);
  unmount();
  opener.remove();
});

it('keeps dialog semantics and a visible alert when a quick save fails', async () => {
  render(<TransactionEntrySheet open onClose={vi.fn()} onSubmitTransaction={vi.fn().mockRejectedValue(new Error('offline'))} />);
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  fireEvent.change(screen.getByLabelText('빠른 입력'), { target: { value: '점심 5000원' } });
  fireEvent.click(screen.getByRole('button', { name: '빠른 입력 저장' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('거래를 저장하지 못했습니다');
});

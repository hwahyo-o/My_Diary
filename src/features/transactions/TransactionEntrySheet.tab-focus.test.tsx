import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TransactionEntrySheet } from './TransactionEntrySheet';

afterEach(() => vi.restoreAllMocks());

it('cycles Tab and Shift+Tab between first and last available dialog controls', () => {
  // JSDOM has no layout; model visible controls without changing production code.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
  render(<TransactionEntrySheet open onClose={vi.fn()} onSubmitTransaction={vi.fn()} />);
  const close = screen.getByRole('button', { name: '닫기' });
  const save = screen.getByRole('button', { name: '빠른 입력 저장' });
  save.focus();
  const next = fireEvent.keyDown(document, { key: 'Tab' });
  expect(next).toBe(false);
  expect(close).toHaveFocus();
  const prev = fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(prev).toBe(false);
  expect(save).toHaveFocus();
});

it('does not intercept normal Tab navigation when focus is inside the dialog', () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
  render(<TransactionEntrySheet open onClose={vi.fn()} onSubmitTransaction={vi.fn()} />);
  const close = screen.getByRole('button', { name: '닫기' });
  close.focus();
  const allowed = fireEvent.keyDown(document, { key: 'Tab' });
  expect(allowed).toBe(true);
  expect(close).toHaveFocus();
});

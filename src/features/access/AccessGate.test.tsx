import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { AccessGate } from './AccessGate';

describe('AccessGate', () => {
  it('requires nickname and a six-digit numeric PIN before creating a profile', async () => {
    const onCreateProfile = vi.fn().mockResolvedValue(undefined);
    const onAccessGranted = vi.fn();
    render(
      <AccessGate
        mode="onboarding"
        onCreateProfile={onCreateProfile}
        onUnlock={vi.fn()}
        onAccessGranted={onAccessGranted}
      />,
    );

    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '예현' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }));

    expect(onCreateProfile).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('6자리 숫자');

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '482951' } });
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }));

    await waitFor(() => expect(onCreateProfile).toHaveBeenCalledWith({ nickname: '예현', pin: '482951' }));
    expect(onAccessGranted).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('PIN')).toHaveValue('');
  });

  it('keeps the user locked and shows a neutral error when unlock fails', async () => {
    const onUnlock = vi.fn().mockRejectedValue(new Error('wrong pin'));
    const onAccessGranted = vi.fn();
    render(
      <AccessGate
        mode="locked"
        onCreateProfile={vi.fn()}
        onUnlock={onUnlock}
        onAccessGranted={onAccessGranted}
      />,
    );

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '482951' } });
    fireEvent.click(screen.getByRole('button', { name: '잠금 해제' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('PIN을 확인해주세요'));
    expect(onAccessGranted).not.toHaveBeenCalled();
    expect(screen.getByLabelText('PIN')).toHaveValue('');
  });
});

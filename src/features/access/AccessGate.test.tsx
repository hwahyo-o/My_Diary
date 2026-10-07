import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { AccessGate } from './AccessGate';

describe('AccessGate', () => {
  it('requires nickname/PIN, then shows RecoveryKey before granting access', async () => {
    const onCreateProfile = vi.fn().mockResolvedValue({ recoveryKey: 'RECOVERY_KEY_SAMPLE' });
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
    expect(screen.getByRole('alert')).toHaveTextContent('10~12자리 숫자');

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '4829517304' } });
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }));

    await waitFor(() => expect(onCreateProfile).toHaveBeenCalledWith({ nickname: '예현', pin: '4829517304' }));
    expect(screen.getByText('RECOVERY_KEY_SAMPLE')).toBeInTheDocument();
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument();
    expect(onAccessGranted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '복구 키를 저장했어요' }));
    expect(onAccessGranted).toHaveBeenCalledTimes(1);
  });

  it('explains when a new PIN is rejected as too weak', async () => {
    const onCreateProfile = vi.fn().mockRejectedValue(new TypeError('PIN is too weak.'));
    render(
      <AccessGate
        mode="onboarding"
        onCreateProfile={onCreateProfile}
        onUnlock={vi.fn()}
        onAccessGranted={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '예현' } });
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234567890' } });
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('너무 단순합니다'));
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

    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '4829517304' } });
    fireEvent.click(screen.getByRole('button', { name: '잠금 해제' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('PIN을 확인해주세요'));
    expect(onAccessGranted).not.toHaveBeenCalled();
    expect(screen.getByLabelText('PIN')).toHaveValue('');
  });
});

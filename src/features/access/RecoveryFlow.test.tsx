import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { RecoveryFlow } from './RecoveryFlow';

describe('RecoveryFlow', () => {
  it('requires a .vault file, RecoveryKey, and new six-digit PIN before recovery', async () => {
    const onRecover = vi.fn().mockResolvedValue(undefined);
    render(<RecoveryFlow onRecover={onRecover} onCancel={vi.fn()} />);

    const file = new File([new Uint8Array([1,2,3])], 'backup.vault');
    fireEvent.change(screen.getByLabelText('복구 Vault 파일'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('복구 RecoveryKey'), { target: { value: 'recover-secret' } });
    fireEvent.change(screen.getByLabelText('새 PIN'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '이 기기에서 복구' }));

    expect(onRecover).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('6자리 숫자');

    fireEvent.change(screen.getByLabelText('새 PIN'), { target: { value: '731905' } });
    fireEvent.click(screen.getByRole('button', { name: '이 기기에서 복구' }));

    await waitFor(() => expect(onRecover).toHaveBeenCalledWith({
      packageBytes: new Uint8Array([1,2,3]),
      recoveryKey: 'recover-secret',
      pin: '731905',
    }));
    expect(screen.getByLabelText('복구 RecoveryKey')).toHaveValue('');
    expect(screen.getByLabelText('새 PIN')).toHaveValue('');
  });

  it('clears RecoveryKey and PIN when cancelled', () => {
    const onCancel = vi.fn();
    render(<RecoveryFlow onRecover={vi.fn()} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText('복구 RecoveryKey'), { target: { value: 'recover-secret' } });
    fireEvent.change(screen.getByLabelText('새 PIN'), { target: { value: '731905' } });
    fireEvent.click(screen.getByRole('button', { name: '복구 취소' }));
    expect(screen.getByLabelText('복구 RecoveryKey')).toHaveValue('');
    expect(screen.getByLabelText('새 PIN')).toHaveValue('');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

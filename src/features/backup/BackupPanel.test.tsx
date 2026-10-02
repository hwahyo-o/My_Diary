import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { BackupPanel } from './BackupPanel';

const inspection = {
  newRecords: 2,
  updatedRecords: 1,
  sameRecords: 4,
  localOnlyRecords: 0,
  conflicts: 0,
};

describe('BackupPanel', () => {
  it('exports encrypted bytes, clears RecoveryKey, and reports recent export', async () => {
    const onExport = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const onDownload = vi.fn();
    render(
      <BackupPanel
        backup={{ lastExportedAt: null, reminderDue: true }}
        onExport={onExport}
        onInspectImport={vi.fn()}
        onApplyImport={vi.fn()}
        onDownload={onDownload}
      />,
    );

    fireEvent.change(screen.getByLabelText('내보내기 RecoveryKey'), { target: { value: 'recover-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '백업 내보내기' }));

    await waitFor(() => expect(onExport).toHaveBeenCalledWith({ recoveryKey: 'recover-secret' }));
    expect(onDownload).toHaveBeenCalledWith(expect.any(Uint8Array), expect.stringMatching(/^vault-[A-F0-9]{12}\.vault$/));
    expect(screen.getByLabelText('내보내기 RecoveryKey')).toHaveValue('');
    expect(screen.getByText(/최근 내보내기/)).toBeInTheDocument();
  });

  it('shows import diff and never applies before explicit confirmation', async () => {
    const onInspectImport = vi.fn().mockResolvedValue(inspection);
    const onApplyImport = vi.fn().mockResolvedValue(undefined);
    render(
      <BackupPanel
        backup={{ lastExportedAt: null, reminderDue: true }}
        onExport={vi.fn()}
        onInspectImport={onInspectImport}
        onApplyImport={onApplyImport}
        onDownload={vi.fn()}
      />,
    );

    const file = new File([new Uint8Array([1,2,3])], 'backup.vault');
    fireEvent.change(screen.getByLabelText('Vault 파일'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('가져오기 RecoveryKey'), { target: { value: 'recover-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '가져오기 검사' }));

    await waitFor(() => expect(onInspectImport).toHaveBeenCalled());
    expect(screen.getByText('신규 2')).toBeInTheDocument();
    expect(screen.getByText('업데이트 1')).toBeInTheDocument();
    expect(onApplyImport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '이 변경사항 적용' }));
    await waitFor(() => expect(onApplyImport).toHaveBeenCalled());
    expect(screen.getByLabelText('가져오기 RecoveryKey')).toHaveValue('');
  });

  it('clears sensitive fields on cancel', () => {
    render(
      <BackupPanel
        backup={{ lastExportedAt: null, reminderDue: true }}
        onExport={vi.fn()}
        onInspectImport={vi.fn()}
        onApplyImport={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('내보내기 RecoveryKey'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('가져오기 RecoveryKey'), { target: { value: 'secret2' } });
    fireEvent.click(screen.getByRole('button', { name: '백업 작업 취소' }));
    expect(screen.getByLabelText('내보내기 RecoveryKey')).toHaveValue('');
    expect(screen.getByLabelText('가져오기 RecoveryKey')).toHaveValue('');
  });
});

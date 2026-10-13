import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

const baseProps = {
  onLock: vi.fn(),
  backup: { lastExportedAt: null, reminderDue: true },
  onExportVault: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  onInspectVaultImport: vi.fn(),
  onApplyVaultImport: vi.fn(),
  onDownloadVault: vi.fn(),
};

describe('SettingsPage operational hub', () => {
  beforeEach(() => localStorage.clear());
  it('shows security, backup, input-rule, and display status without fake navigation buttons', () => {
    render(<SettingsPage {...baseProps} />);

    expect(screen.getByRole('heading', { name: '보안' })).toBeInTheDocument();
    expect(screen.getByText('5분 비활성 시 잠금')).toBeInTheDocument();
    expect(screen.getByText('10–12자리 숫자 · 반복/연속 패턴 차단')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: '백업 및 복구' })).toBeInTheDocument();
    expect(screen.getByText('아직 백업 없음')).toBeInTheDocument();
    expect(screen.getByText('백업 필요')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: '분류 규칙' })).toBeInTheDocument();
    expect(screen.getByText('‘어제’ 입력 시 전날 거래로 기록')).toBeInTheDocument();
    expect(screen.getByText('점심 · 식사')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: '표시 및 앱 상태' })).toBeInTheDocument();
    expect(screen.getByText('Local-first PWA')).toBeInTheDocument();
    expect(screen.getByText('Cloudflare Pages')).toBeInTheDocument();
  });

  it('locks immediately and expands the real backup tools', () => {
    const onLock = vi.fn();
    render(<SettingsPage {...baseProps} onLock={onLock} />);

    fireEvent.click(screen.getByRole('button', { name: '지금 잠그기' }));
    expect(onLock).toHaveBeenCalledTimes(1);

    const toggle = screen.getByRole('button', { name: '백업 도구 열기' });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: '백업 도구 닫기' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText(/RecoveryKey/).length).toBeGreaterThan(0);
  });

  it('restores persisted backup metadata when the parent only has the default empty status', () => {
    localStorage.setItem('my-diary-backup-status-v1', '2026-10-12T08:00:00.000Z');
    render(<SettingsPage {...baseProps} />);

    expect(screen.getByText('백업 최신')).toBeInTheDocument();
    expect(screen.getByText('최근 백업 기록이 있습니다.')).toBeInTheDocument();
    expect(screen.queryByText('아직 백업 없음')).not.toBeInTheDocument();
  });

  it('updates the settings summary immediately after a successful export', async () => {
    const onExportVault = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    render(<SettingsPage {...baseProps} onExportVault={onExportVault} />);

    fireEvent.click(screen.getByRole('button', { name: '백업 도구 열기' }));
    fireEvent.change(screen.getByLabelText('내보내기 RecoveryKey'), { target: { value: 'recover-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '백업 내보내기' }));

    await waitFor(() => expect(screen.getByText('백업 최신')).toBeInTheDocument());
    expect(screen.getByText('최근 백업 기록이 있습니다.')).toBeInTheDocument();
    expect(screen.queryByText('아직 백업 없음')).not.toBeInTheDocument();
  });

  it('shows a formatted last-backup time when a backup exists', () => {
    render(
      <SettingsPage
        {...baseProps}
        backup={{ lastExportedAt: '2026-10-12T08:00:00.000Z', reminderDue: false }}
      />,
    );

    expect(screen.getByText('백업 최신')).toBeInTheDocument();
    expect(screen.getByText('최근 백업 기록이 있습니다.')).toBeInTheDocument();
    expect(screen.getByText('2026.10.12 17:00 (KST)')).toBeInTheDocument();
    expect(screen.queryByText('아직 백업 없음')).not.toBeInTheDocument();
  });
});

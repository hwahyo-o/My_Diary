import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';
import type { ClassificationSettingsViewModel } from '../features/transactions/classification-settings';

const baseProps = {
  onLock: vi.fn(),
  backup: { lastExportedAt: null, reminderDue: true },
  onExportVault: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  onInspectVaultImport: vi.fn(),
  onApplyVaultImport: vi.fn(),
  onDownloadVault: vi.fn(),
  cloudEnrolled: false,
  cloudConflict: false,
  cloudSyncStatus: 'not-connected' as const,
  onEnrollCloud: vi.fn().mockResolvedValue(undefined),
  onResetAllData: vi.fn().mockResolvedValue(undefined),
  onRotateRecoveryKey: vi.fn().mockResolvedValue('test-recovery-key'),
  classificationSettings: {
    incomeKeywords: [
      { value: '월급', source: 'default' },
      { value: '부수입', source: 'default' },
    ],
    hasIncomeKeywordChanges: false,
    correctionSuggestions: [],
    categories: [
      {
        id: 'food',
        label: '식비',
        defaultFixedVariable: 'variable',
        mode: 'auto',
        keywords: [{ value: '커피', source: 'default' }],
        hasKeywordChanges: false,
      },
      {
        id: 'subscription',
        label: '구독',
        defaultFixedVariable: 'fixed',
        mode: 'auto',
        keywords: [{ value: '구독', source: 'default' }],
        hasKeywordChanges: false,
      },
    ],
  } satisfies ClassificationSettingsViewModel,
  onSaveFixedVariableRule: vi.fn().mockResolvedValue(undefined),
  onAcceptCorrectionSuggestion: vi.fn().mockResolvedValue(undefined),
  onDismissCorrectionSuggestion: vi.fn().mockResolvedValue(undefined),
  onAddCategoryKeyword: vi.fn().mockResolvedValue(undefined),
  onRemoveCategoryKeyword: vi.fn().mockResolvedValue(undefined),
  onRestoreCategoryKeywords: vi.fn().mockResolvedValue(undefined),
  onAddIncomeKeyword: vi.fn().mockResolvedValue(undefined),
  onRemoveIncomeKeyword: vi.fn().mockResolvedValue(undefined),
  onRestoreIncomeKeywords: vi.fn().mockResolvedValue(undefined),
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
    expect(screen.getByText('오늘 · 어제 · 그제 · 그저께 · n일 전')).toBeInTheDocument();
    expect(screen.getByText(/아침 · 점심 · 저녁/)).toBeInTheDocument();
    expect(screen.getByText('편집 가능')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: '표시 및 앱 상태' })).toBeInTheDocument();
    expect(screen.getByText('Local-first PWA')).toBeInTheDocument();
    expect(screen.getByText('Cloudflare Pages')).toBeInTheDocument();
  });

  it('saves a category fixed-variable override from the rule editor', async () => {
    const onSaveFixedVariableRule = vi.fn().mockResolvedValue(undefined);
    render(<SettingsPage {...baseProps} onSaveFixedVariableRule={onSaveFixedVariableRule} />);

    fireEvent.change(screen.getByLabelText('식비 고정 변동 규칙'), { target: { value: 'fixed' } });

    await waitFor(() => expect(onSaveFixedVariableRule).toHaveBeenCalledWith({
      categoryId: 'food',
      mode: 'fixed',
    }));
  });

  it('adds and removes income keywords from settings', async () => {
    const onAddIncomeKeyword = vi.fn().mockResolvedValue(undefined);
    const onRemoveIncomeKeyword = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsPage
        {...baseProps}
        onAddIncomeKeyword={onAddIncomeKeyword}
        onRemoveIncomeKeyword={onRemoveIncomeKeyword}
      />,
    );

    fireEvent.change(screen.getByLabelText('새 수입 키워드'), { target: { value: '원고료' } });
    fireEvent.click(screen.getAllByRole('button', { name: '추가' })[0]!);
    await waitFor(() => expect(onAddIncomeKeyword).toHaveBeenCalledWith({ keyword: '원고료' }));

    fireEvent.click(screen.getByRole('button', { name: '월급' }));
    await waitFor(() => expect(onRemoveIncomeKeyword).toHaveBeenCalledWith({ keyword: '월급' }));
  });

  it('adds and removes category keywords from settings', async () => {
    const onAddCategoryKeyword = vi.fn().mockResolvedValue(undefined);
    const onRemoveCategoryKeyword = vi.fn().mockResolvedValue(undefined);
    render(
      <SettingsPage
        {...baseProps}
        onAddCategoryKeyword={onAddCategoryKeyword}
        onRemoveCategoryKeyword={onRemoveCategoryKeyword}
      />,
    );

    const foodKeywordInput = screen.getByLabelText('식비 새 키워드');
    fireEvent.change(foodKeywordInput, { target: { value: '샌드위치' } });
    const foodAddButton = foodKeywordInput.parentElement?.querySelector('button');
    if (!foodAddButton) throw new Error('식비 키워드 추가 버튼을 찾을 수 없습니다.');
    fireEvent.click(foodAddButton);
    await waitFor(() => expect(onAddCategoryKeyword).toHaveBeenCalledWith({
      categoryId: 'food',
      keyword: '샌드위치',
    }));

    fireEvent.click(screen.getByRole('button', { name: '커피' }));
    await waitFor(() => expect(onRemoveCategoryKeyword).toHaveBeenCalledWith({
      categoryId: 'food',
      keyword: '커피',
    }));
  });

  it('enrolls the current Vault into encrypted cloud sync with the current PIN', async () => {
    const onEnrollCloud = vi.fn().mockResolvedValue(undefined);
    render(<SettingsPage {...baseProps} onEnrollCloud={onEnrollCloud} />);

    fireEvent.change(screen.getByLabelText('클라우드 동기화 PIN'), { target: { value: '4829517304' } });
    fireEvent.click(screen.getByRole('button', { name: '클라우드 동기화 시작' }));

    await waitFor(() => expect(onEnrollCloud).toHaveBeenCalledWith({ pin: '4829517304' }));
    expect(screen.getByText('로컬 저장 완료 · 클라우드 동기화 확인 대기')).toBeInTheDocument();
  });

  it('shows an explicit warning when overlapping cloud edits need manual resolution', () => {
    render(<SettingsPage {...baseProps} cloudEnrolled cloudConflict />);

    expect(screen.getByText('충돌 확인 필요')).toBeInTheDocument();
    expect(screen.getByText('충돌 확인 필요 · 로컬 기록 유지')).toBeInTheDocument();
  });

  it('shows an already-enrolled cloud Vault without asking for the PIN again', () => {
    render(<SettingsPage {...baseProps} cloudEnrolled />);

    expect(screen.getByText('로컬 저장 완료 · 클라우드 동기화 확인 대기')).toBeInTheDocument();
    expect(screen.queryByLabelText('클라우드 동기화 PIN')).not.toBeInTheDocument();
  });

  it('requires both the current PIN and exact reset phrase before destructive reset', async () => {
    const onResetAllData = vi.fn().mockResolvedValue(undefined);
    render(<SettingsPage {...baseProps} onResetAllData={onResetAllData} />);

    fireEvent.change(screen.getByLabelText('초기화 확인 PIN'), { target: { value: '4829517304' } });
    fireEvent.click(screen.getByRole('button', { name: '모든 데이터 초기화' }));
    expect(onResetAllData).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('초기화');

    fireEvent.change(screen.getByLabelText('초기화 확인 문구'), { target: { value: '초기화' } });
    fireEvent.click(screen.getByRole('button', { name: '모든 데이터 초기화' }));

    await waitFor(() => expect(onResetAllData).toHaveBeenCalledWith({ pin: '4829517304' }));
  });

  it('warns that cloud reset does not remotely erase other device copies or exported backups', () => {
    render(<SettingsPage {...baseProps} cloudEnrolled />);

    expect(screen.getByText('현재 기기 + 클라우드 계정 데이터')).toBeInTheDocument();
    expect(screen.getByText(/다른 기기에 이미 저장된 로컬 Vault 사본/)).toBeInTheDocument();
    expect(screen.getByText(/\.vault 백업 파일은 원격으로 삭제할 수 없습니다/)).toBeInTheDocument();
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

describe('cloud synchronization status visibility', () => {
  it.each([
    ['pending', '로컬 저장 완료 · 클라우드 동기화 확인 대기'],
    ['syncing', '클라우드 동기화 진행 중'],
    ['synced', '클라우드 동기화 완료'],
    ['error', '클라우드 동기화 실패 · 다음 잠금 해제에서 재시도'],
    ['conflict', '충돌 확인 필요 · 로컬 기록 유지'],
  ] as const)('renders %s truthfully', (status, message) => {
    render(<SettingsPage {...baseProps} cloudEnrolled cloudSyncStatus={status} />);
    expect(screen.getByRole('status')).toHaveTextContent(message);
  });
});

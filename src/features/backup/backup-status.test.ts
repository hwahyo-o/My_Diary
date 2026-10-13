import { beforeEach, describe, expect, it } from 'vitest';
import { deriveBackupStatus, formatBackupDateKst, readBackupStatus, writeBackupExportedAt } from './backup-status';

describe('backup status metadata', () => {
  beforeEach(() => localStorage.clear());

  it('recommends a backup when none exists or the last export is at least seven days old', () => {
    const now = new Date('2026-10-10T00:00:00Z');
    expect(deriveBackupStatus(null, now).reminderDue).toBe(true);
    expect(deriveBackupStatus('2026-10-03T00:00:00.000Z', now).reminderDue).toBe(true);
    expect(deriveBackupStatus('2026-10-04T00:00:01.000Z', now).reminderDue).toBe(false);
  });

  it('formats persisted UTC timestamps as readable Korea Standard Time', () => {
    expect(formatBackupDateKst('2026-10-13T05:50:48.715Z')).toBe('2026.10.13 14:50 (KST)');
    expect(formatBackupDateKst(null)).toBe('아직 백업 없음');
    expect(formatBackupDateKst('invalid')).toBe('백업 기록 확인 필요');
  });

  it('persists only the last export timestamp', () => {
    writeBackupExportedAt('2026-10-02T06:30:00.000Z');
    expect(readBackupStatus(new Date('2026-10-03T00:00:00Z'))).toEqual({
      lastExportedAt: '2026-10-02T06:30:00.000Z',
      reminderDue: false,
    });
    expect(localStorage.length).toBe(1);
  });
});

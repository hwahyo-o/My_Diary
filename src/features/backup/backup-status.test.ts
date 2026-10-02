import { beforeEach, describe, expect, it } from 'vitest';
import { deriveBackupStatus, readBackupStatus, writeBackupExportedAt } from './backup-status';

describe('backup status metadata', () => {
  beforeEach(() => localStorage.clear());

  it('recommends a backup when none exists or the last export is at least seven days old', () => {
    const now = new Date('2026-10-10T00:00:00Z');
    expect(deriveBackupStatus(null, now).reminderDue).toBe(true);
    expect(deriveBackupStatus('2026-10-03T00:00:00.000Z', now).reminderDue).toBe(true);
    expect(deriveBackupStatus('2026-10-04T00:00:01.000Z', now).reminderDue).toBe(false);
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

import type { BackupStatusViewModel } from '../../app/ui-types';

const STORAGE_KEY = 'my-diary-backup-status-v1';
const REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function deriveBackupStatus(lastExportedAt: string | null, now = new Date()): BackupStatusViewModel {
  if (!lastExportedAt) return { lastExportedAt: null, reminderDue: true };
  const last = Date.parse(lastExportedAt);
  if (!Number.isFinite(last)) return { lastExportedAt: null, reminderDue: true };
  return {
    lastExportedAt,
    reminderDue: now.getTime() - last >= REMINDER_INTERVAL_MS,
  };
}

export function readBackupStatus(now = new Date()): BackupStatusViewModel {
  return deriveBackupStatus(localStorage.getItem(STORAGE_KEY), now);
}

export function writeBackupExportedAt(iso: string): void {
  localStorage.setItem(STORAGE_KEY, iso);
}

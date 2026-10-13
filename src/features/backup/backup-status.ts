import type { BackupStatusViewModel } from '../../app/ui-types';

const STORAGE_KEY = 'my-diary-backup-status-v1';
const REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const KOREA_TIME_ZONE = 'Asia/Seoul';

export function formatBackupDateKst(value: string | null): string {
  if (!value) return '아직 백업 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '백업 기록 확인 필요';

  const parts = new Intl.DateTimeFormat('ko-KR-u-ca-gregory', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}.${part('month')}.${part('day')} ${part('hour')}:${part('minute')} (KST)`;
}

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

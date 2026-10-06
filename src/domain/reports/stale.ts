import type { Report } from './types';

export function isReportStale(report: Report, vaultRevision: number): boolean {
  return report.sourceRevision !== vaultRevision;
}

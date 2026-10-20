import type { CloudConflictReviewPlan } from './cloud-conflict-review-plan';

/** Safe metadata-only view model. Never expose ciphertext, PIN, keys or decrypted finance amounts. */
export interface CloudConflictSafeSummary {
  readonly conflictingRecordCount: number;
  readonly conflictingEventCount: number;
  readonly needsReview: boolean;
  readonly message: string;
}
export function toCloudConflictSafeSummary(plan: CloudConflictReviewPlan): CloudConflictSafeSummary {
  const conflictingRecordCount = new Set(plan.recordIds).size;
  const conflictingEventCount = new Set(plan.eventIds).size;
  const needsReview = plan.requiresManualReview && (conflictingRecordCount + conflictingEventCount > 0);
  return {
    conflictingRecordCount,
    conflictingEventCount,
    needsReview,
    message: needsReview
      ? '동기화 충돌이 발견됐습니다. 원본 기록은 유지되며, 안전한 검토가 필요합니다.'
      : '검토가 필요한 충돌 기록이 없습니다.',
  };
}

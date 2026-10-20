import type { CloudConflictReviewPlan } from './cloud-conflict-review-plan';

export interface VerifiedConflictReviewContext {
  readonly expectedAccountId: string;
  readonly remoteAccountId: string;
  readonly expectedVaultId: string;
  readonly remoteVaultId: string;
  readonly expectedCloudRevision: number;
  readonly downloadedCloudRevision: number;
  readonly latestCloudRevision: number;
  readonly localRevisionAtRead: number;
  readonly localRevisionBeforeDisplay: number;
  readonly unlocked: boolean;
}

/** Reject stale or mismatched review data before presenting any conflicting values. */
export function assertVerifiedConflictReview(
  context: VerifiedConflictReviewContext,
  plan: CloudConflictReviewPlan,
): void {
  if (!context.unlocked || !context.expectedAccountId || !context.expectedVaultId ||
      context.remoteAccountId !== context.expectedAccountId ||
      context.remoteVaultId !== context.expectedVaultId) {
    throw new Error('Cloud conflict review identity or session is invalid.');
  }
  const revisions = [
    context.expectedCloudRevision, context.downloadedCloudRevision,
    context.latestCloudRevision, context.localRevisionAtRead, context.localRevisionBeforeDisplay,
  ];
  if (!revisions.every((n) => Number.isSafeInteger(n) && n >= 0) ||
      context.expectedCloudRevision !== context.downloadedCloudRevision ||
      context.latestCloudRevision !== context.downloadedCloudRevision ||
      context.localRevisionAtRead !== context.localRevisionBeforeDisplay) {
    throw new Error('Cloud conflict review became stale; refresh before choosing.');
  }
  if (!plan.requiresManualReview || plan.recordIds.length + plan.eventIds.length === 0) {
    throw new Error('No unresolved conflicts are available for review.');
  }
}

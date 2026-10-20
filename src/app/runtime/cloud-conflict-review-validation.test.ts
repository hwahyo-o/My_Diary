import { expect, it } from 'vitest';
import { assertVerifiedConflictReview, type VerifiedConflictReviewContext } from './cloud-conflict-review-validation';
const valid: VerifiedConflictReviewContext = {
  expectedAccountId: 'account-a', remoteAccountId: 'account-a',
  expectedVaultId: 'vault-a', remoteVaultId: 'vault-a',
  expectedCloudRevision: 4, downloadedCloudRevision: 4, latestCloudRevision: 4,
  localRevisionAtRead: 3, localRevisionBeforeDisplay: 3, unlocked: true,
};
const plan = { recordIds: ['budget-a'], eventIds: [], requiresManualReview: true };
it('accepts stable authenticated review metadata', () => {
  expect(() => assertVerifiedConflictReview(valid, plan)).not.toThrow();
});
it.each([
  { remoteAccountId: 'other-account' },
  { remoteVaultId: 'other-vault' },
  { latestCloudRevision: 5 },
  { downloadedCloudRevision: 5 },
  { localRevisionBeforeDisplay: 4 },
  { unlocked: false },
])('rejects an invalid or stale review context %j', (override) => {
  expect(() => assertVerifiedConflictReview({ ...valid, ...override }, plan)).toThrow();
});
it('rejects a review with no unresolved conflict records or events', () => {
  expect(() => assertVerifiedConflictReview(valid, { recordIds: [], eventIds: [], requiresManualReview: false })).toThrow();
});

import { expect, it } from 'vitest';
import { toCloudConflictSafeSummary } from './cloud-conflict-safe-summary';

it('exposes counts only, without leaking raw record identities or sensitive content', () => {
  const result = toCloudConflictSafeSummary({
    recordIds: ['secret-record-id', 'secret-record-id', 'another-id'],
    eventIds: ['private-event-id'], requiresManualReview: true,
  });
  expect(result.conflictingRecordCount).toBe(2);
  expect(result.conflictingEventCount).toBe(1);
  expect(result.needsReview).toBe(true);
  expect(JSON.stringify(result)).not.toContain('secret-record-id');
  expect(JSON.stringify(result)).not.toContain('private-event-id');
});
it('does not show a review warning when there are no conflicts', () => {
  expect(toCloudConflictSafeSummary({ recordIds: [], eventIds: [], requiresManualReview: false }).needsReview).toBe(false);
});

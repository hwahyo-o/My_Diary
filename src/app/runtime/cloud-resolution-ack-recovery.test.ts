import { expect, it } from 'vitest';
import { assertSafeCloudResolutionAcknowledgement } from './cloud-resolution-ack-recovery';
const valid = { upload: { kind: 'acknowledged' as const, serverRevision: 9 },
  expectedLocalRevision: 5, currentLocalRevision: 5,
  cloudConflictActive: true, vaultUnlocked: true };
it('permits only verified acknowledgement metadata recovery', () => {
  expect(assertSafeCloudResolutionAcknowledgement(valid)).toBe(9);
});
it.each([
  { upload: { kind: 'manual-review-required' as const } },
  { upload: { kind: 'retry-same-upload' as const, expectedRevision: 8 } },
  { currentLocalRevision: 6 }, { cloudConflictActive: false }, { vaultUnlocked: false },
])('does not acknowledge unresolved or stale outcomes', (override) => {
  expect(() => assertSafeCloudResolutionAcknowledgement({ ...valid, ...override })).toThrow();
});

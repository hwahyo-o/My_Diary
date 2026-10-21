import { expect, it } from 'vitest';
import { assertCloudResolutionUploadPreflight } from './cloud-resolution-upload-preflight';
const plan = { sourceRecordId: 'source', month: '2026-10-01',
  chosenLimitMinor: 100000, expectedLocalRevision: 3, expectedCloudRevision: 5,
  mode: 'append-new-budget' as const };
const valid = { expectedCloudRevision: 5, verifiedCloudRevision: 5,
  currentLocalRevision: 4, committedLocalRevision: 4,
  unresolvedRecordCount: 0, unresolvedEventCount: 0,
  vaultUnlocked: true, accountMatches: true, vaultMatches: true,
  snapshotDigestVerified: true };
it('accepts only a verified resolution transaction and cloud CAS revision', () => {
  expect(() => assertCloudResolutionUploadPreflight(plan, valid)).not.toThrow();
});
it.each([{ verifiedCloudRevision: 6 }, { currentLocalRevision: 5 },
  { unresolvedEventCount: 1 }, { unresolvedRecordCount: 1 },
  { vaultUnlocked: false }, { snapshotDigestVerified: false },
  { vaultMatches: false }, { accountMatches: false },
])('rejects stale or unsafe proposed uploads %j', (override) => {
  expect(() => assertCloudResolutionUploadPreflight(plan, { ...valid, ...override })).toThrow();
});

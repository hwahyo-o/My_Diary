import { expect, it } from 'vitest';
import { decideCloudResolutionRetry } from './cloud-resolution-cas-retry-decision';
const digest = 'ab'.repeat(32);
const base = { expectedCloudRevision: 7, latestServerRevision: 8,
  expectedUploadedDigest: digest, latestServerDigest: digest,
  localRevisionUnchanged: true, vaultUnlocked: true };
it('recognizes an upload already committed after a lost response', () => {
  expect(decideCloudResolutionRetry(base)).toEqual({ kind: 'acknowledged', serverRevision: 8 });
});
it('allows retry only against the untouched expected server revision', () => {
  expect(decideCloudResolutionRetry({ ...base, latestServerRevision: 7, latestServerDigest: null }))
    .toEqual({ kind: 'retry-same-upload', expectedRevision: 7 });
});
it.each([{ latestServerDigest: 'cd'.repeat(32) }, { latestServerRevision: 9 },
  { localRevisionUnchanged: false }, { vaultUnlocked: false },
  { expectedUploadedDigest: 'invalid' }])('fails closed on uncertain or changed remote state', (override) => {
  expect(decideCloudResolutionRetry({ ...base, ...override })).toEqual({ kind: 'manual-review-required' });
});

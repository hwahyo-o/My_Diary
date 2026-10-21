import { expect, it, vi } from 'vitest';
import { executeCloudResolutionCasUpload } from './cloud-resolution-cas-upload-executor';
const digest = 'a12871fee210fb8619291eaea194581cbd2531e4b23759d225f6806923f63222';
const plan = { sourceRecordId: 'source', month: '2026-10-01', chosenLimitMinor: 120000,
  expectedLocalRevision: 4, expectedCloudRevision: 7, mode: 'append-new-budget' as const };
const preflight = { expectedCloudRevision: 7, verifiedCloudRevision: 7,
  currentLocalRevision: 5, committedLocalRevision: 5,
  unresolvedRecordCount: 0, unresolvedEventCount: 0,
  vaultUnlocked: true, accountMatches: true, vaultMatches: true,
  snapshotDigestVerified: true };
const payload = { bytes: new Uint8Array([1, 2]), objectSha256: digest };
it('acknowledges only an observed matching server digest and revision', async () => {
  const getHead = vi.fn().mockResolvedValueOnce({ revision: 7, objectSha256: null })
    .mockResolvedValueOnce({ revision: 8, objectSha256: digest });
  const uploadSnapshot = vi.fn().mockResolvedValue({ revision: 8 });
  expect((await executeCloudResolutionCasUpload({ getHead, uploadSnapshot },
    plan, preflight, payload, async () => true)).decision.kind).toBe('acknowledged');
  expect(uploadSnapshot).toHaveBeenCalledTimes(1);
});
it('does not upload if the server moved before CAS', async () => {
  const getHead = vi.fn().mockResolvedValue({ revision: 8, objectSha256: 'cd'.repeat(32) });
  const uploadSnapshot = vi.fn();
  expect((await executeCloudResolutionCasUpload({ getHead, uploadSnapshot },
    plan, preflight, payload, async () => true)).decision.kind).toBe('manual-review-required');
  expect(uploadSnapshot).not.toHaveBeenCalled();
});
it('classifies lost upload response without repeating the write', async () => {
  const getHead = vi.fn().mockResolvedValueOnce({ revision: 7, objectSha256: null })
    .mockResolvedValueOnce({ revision: 8, objectSha256: digest });
  const uploadSnapshot = vi.fn().mockRejectedValue(new Error('connection lost'));
  expect((await executeCloudResolutionCasUpload({ getHead, uploadSnapshot },
    plan, preflight, payload, async () => true)).decision.kind).toBe('acknowledged');
  expect(uploadSnapshot).toHaveBeenCalledTimes(1);
});

it('rejects a mismatched encrypted payload digest before sending any request', async () => {
  const getHead = vi.fn();
  const uploadSnapshot = vi.fn();
  await expect(executeCloudResolutionCasUpload({ getHead, uploadSnapshot },
    plan, preflight, { bytes: new Uint8Array([9, 8]), objectSha256: digest }, async () => true))
    .rejects.toThrow('digest mismatch');
  expect(getHead).not.toHaveBeenCalled();
  expect(uploadSnapshot).not.toHaveBeenCalled();
});

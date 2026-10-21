import type { CloudSyncClient } from '../../cloud-sync/http-client';
import type { ImmutableBudgetResolutionPlan } from './budget-conflict-immutable-resolution-plan';
import { assertCloudResolutionUploadPreflight, type CloudResolutionUploadPreflight } from './cloud-resolution-upload-preflight';
import { decideCloudResolutionRetry, type ResolutionRetryDecision } from './cloud-resolution-cas-retry-decision';

export interface CloudResolutionUploadOutcome {
  readonly decision: ResolutionRetryDecision;
}

/**
 * One guarded CAS upload only. Never retries automatically, clears cloudConflict,
 * mutates local records, or treats an HTTP error as definitive upload failure.
 * Caller must supply authenticated/verified encrypted snapshot and fresh preflight.
 */
export async function executeCloudResolutionCasUpload(
  client: Pick<CloudSyncClient, 'getHead' | 'uploadSnapshot'>,
  plan: ImmutableBudgetResolutionPlan,
  preflight: CloudResolutionUploadPreflight,
  encrypted: { readonly bytes: Uint8Array; readonly objectSha256: string },
  localRevisionUnchanged: () => Promise<boolean>,
): Promise<CloudResolutionUploadOutcome> {
  assertCloudResolutionUploadPreflight(plan, preflight);
  if (!/^[a-f0-9]{64}$/i.test(encrypted.objectSha256) || !encrypted.bytes.length) {
    throw new Error('Invalid encrypted resolution snapshot.');
  }
  const before = await client.getHead();
  if (before.revision !== plan.expectedCloudRevision || !await localRevisionUnchanged()) {
    return { decision: { kind: 'manual-review-required' } };
  }
  try {
    const uploaded = await client.uploadSnapshot({
      expectedRevision: plan.expectedCloudRevision,
      objectSha256: encrypted.objectSha256,
      bytes: encrypted.bytes,
    });
    // Treat success as provisional until the observed server state matches.
    if (uploaded.revision !== plan.expectedCloudRevision + 1) {
      return { decision: { kind: 'manual-review-required' } };
    }
  } catch {
    // A lost response might still mean the server committed the upload.
    // The authoritative HEAD is checked below before any further action.
  }
  let head: Awaited<ReturnType<CloudSyncClient['getHead']>>;
  try {
    head = await client.getHead();
  } catch {
    return { decision: { kind: 'manual-review-required' } };
  }
  return { decision: decideCloudResolutionRetry({
    expectedCloudRevision: plan.expectedCloudRevision,
    latestServerRevision: head.revision,
    expectedUploadedDigest: encrypted.objectSha256,
    latestServerDigest: head.objectSha256,
    localRevisionUnchanged: await localRevisionUnchanged(),
    vaultUnlocked: preflight.vaultUnlocked,
  }) };
}

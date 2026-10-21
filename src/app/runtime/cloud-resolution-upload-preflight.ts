import type { ImmutableBudgetResolutionPlan } from './budget-conflict-immutable-resolution-plan';

export interface CloudResolutionUploadPreflight {
  readonly expectedCloudRevision: number;
  readonly verifiedCloudRevision: number;
  readonly currentLocalRevision: number;
  readonly committedLocalRevision: number;
  readonly unresolvedRecordCount: number;
  readonly unresolvedEventCount: number;
  readonly vaultUnlocked: boolean;
  readonly accountMatches: boolean;
  readonly vaultMatches: boolean;
  readonly snapshotDigestVerified: boolean;
}
/**
 * Validation only: never clears a conflict, mutates local data or initiates an upload.
 * A future caller must still pass expectedCloudRevision to the server's atomic CAS.
 */
export function assertCloudResolutionUploadPreflight(
  plan: ImmutableBudgetResolutionPlan,
  input: CloudResolutionUploadPreflight,
): void {
  if (!input.vaultUnlocked || !input.accountMatches || !input.vaultMatches ||
      !input.snapshotDigestVerified) {
    throw new Error('Cloud resolution upload security verification failed.');
  }
  if ([input.expectedCloudRevision, input.verifiedCloudRevision,
       input.currentLocalRevision, input.committedLocalRevision].some(
        (n) => !Number.isSafeInteger(n) || n < 0,
      ) ||
      input.expectedCloudRevision !== plan.expectedCloudRevision ||
      input.verifiedCloudRevision !== input.expectedCloudRevision ||
      input.committedLocalRevision !== input.currentLocalRevision ||
      input.committedLocalRevision !== plan.expectedLocalRevision + 1) {
    throw new Error('Cloud resolution upload revision changed; restart review.');
  }
  if (input.unresolvedRecordCount !== 0 || input.unresolvedEventCount !== 0) {
    throw new Error('Cloud resolution upload blocked by unresolved encrypted conflicts.');
  }
}

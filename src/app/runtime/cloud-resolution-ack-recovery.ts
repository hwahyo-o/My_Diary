import type { ResolutionRetryDecision } from './cloud-resolution-cas-retry-decision';
export interface ResolutionAcknowledgementRecovery {
  readonly upload: ResolutionRetryDecision;
  readonly expectedLocalRevision: number;
  readonly currentLocalRevision: number;
  readonly cloudConflictActive: boolean;
  readonly vaultUnlocked: boolean;
}
/**
 * Allows metadata reconciliation only after independently verified server acknowledgement.
 * This is not a permission to clear the hard conflict or automatically synchronize again.
 */
export function assertSafeCloudResolutionAcknowledgement(input: ResolutionAcknowledgementRecovery): number {
  if (input.upload.kind !== 'acknowledged' ||
      !input.cloudConflictActive || !input.vaultUnlocked ||
      !Number.isSafeInteger(input.expectedLocalRevision) ||
      input.expectedLocalRevision < 0 ||
      input.currentLocalRevision !== input.expectedLocalRevision) {
    throw new Error('Resolution acknowledgement is unsafe; keep conflict and review again.');
  }
  return input.upload.serverRevision;
}

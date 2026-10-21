export type ResolutionRetryDecision =
  | { readonly kind: 'acknowledged'; readonly serverRevision: number }
  | { readonly kind: 'retry-same-upload'; readonly expectedRevision: number }
  | { readonly kind: 'manual-review-required' };

/**
 * Decide what to do after an uncertain cloud upload outcome.
 * Never overwrite a different server snapshot and never assume HTTP errors mean no upload occurred.
 */
export function decideCloudResolutionRetry(input: {
  readonly expectedCloudRevision: number;
  readonly latestServerRevision: number;
  readonly expectedUploadedDigest: string;
  readonly latestServerDigest: string | null;
  readonly localRevisionUnchanged: boolean;
  readonly vaultUnlocked: boolean;
}): ResolutionRetryDecision {
  const { expectedCloudRevision, latestServerRevision, expectedUploadedDigest, latestServerDigest } = input;
  if (!input.vaultUnlocked || !input.localRevisionUnchanged ||
      !Number.isSafeInteger(expectedCloudRevision) || expectedCloudRevision < 0 ||
      !Number.isSafeInteger(latestServerRevision) || latestServerRevision < 0 ||
      !/^[a-f0-9]{64}$/i.test(expectedUploadedDigest)) {
    return { kind: 'manual-review-required' };
  }
  if (latestServerRevision === expectedCloudRevision + 1 &&
      latestServerDigest?.toLowerCase() === expectedUploadedDigest.toLowerCase()) {
    return { kind: 'acknowledged', serverRevision: latestServerRevision };
  }
  if (latestServerRevision === expectedCloudRevision) {
    return { kind: 'retry-same-upload', expectedRevision: expectedCloudRevision };
  }
  return { kind: 'manual-review-required' };
}

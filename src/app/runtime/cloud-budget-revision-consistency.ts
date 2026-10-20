/** Reject cloud snapshots which change between HEAD checks without exposing stale values. */
export function assertCloudBudgetRevisionConsistent(
  firstRevision: number,
  downloadedRevision: number,
  latestRevision: number,
): void {
  if (![firstRevision, downloadedRevision, latestRevision].every(Number.isSafeInteger)
      || firstRevision < 0 || downloadedRevision < 0 || latestRevision < 0
      || firstRevision !== downloadedRevision || latestRevision !== downloadedRevision) {
    throw new Error('Cloud snapshot revision changed; refresh before comparing.');
  }
}

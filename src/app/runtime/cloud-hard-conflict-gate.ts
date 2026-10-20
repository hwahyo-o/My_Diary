/** Abort reconciliation before any local replacement or cloud upload. */
export function assertNoCloudHardConflicts(hardConflicts: number): void {
  if (!Number.isSafeInteger(hardConflicts) || hardConflicts < 0 || hardConflicts > 0) {
    throw new Error('Cloud sync contains overlapping record edits that require manual resolution.');
  }
}

export function assertLocalBudgetRevisionStable(before: number, after: number): void {
  if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after) || before < 0 || after < 0 || before !== after) {
    throw new Error('Local budget data changed during cloud comparison; refresh before comparing.');
  }
}

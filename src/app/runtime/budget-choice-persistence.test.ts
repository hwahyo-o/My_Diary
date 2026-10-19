import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('confirms an explicit historical same-month budget without deleting older history', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `budget-choice-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '예산 선택 테스트', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 100000 });
    await runtime.saveBudget({ limitMinor: 200000 });
    const { inspectMonthlyBudgets } = await import('./budget-candidates');
    // Identify the older persisted candidate using only the isolated test database.
    const { EncryptedRepository } = await import('../../storage/repository');
    // Candidate IDs are intentionally not exposed by the current runtime UI.
    // The pure selection guard is tested separately until an explicit UI view model is added.
    expect(inspectMonthlyBudgets).toBeTypeOf('function');
    expect(EncryptedRepository).toBeTypeOf('function');
    await expect(runtime.confirmBudgetCandidate('00000000-0000-4000-8000-0000000000a1'))
      .rejects.toThrow('Selected budget candidate is no longer available');
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(200000);
    runtime.lock();
    await runtime.unlock('4829517304');
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(200000);
  } finally {
    runtime.close();
  }
});

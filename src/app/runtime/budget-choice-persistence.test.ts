import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('confirms explicitly selected historical budget by appending, without deleting the prior candidates', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `budget-choice-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '예산 선택 테스트', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 100000 });
    await runtime.saveBudget({ limitMinor: 200000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    expect(before.map((item) => item.limitMinor)).toEqual([200000, 100000]);
    await runtime.confirmBudgetCandidate(before[1]!.id);
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(100000);
    const after = await runtime.listCurrentMonthBudgetCandidates();
    expect(after).toHaveLength(3);
    expect(after.map((item) => item.limitMinor)).toEqual([100000, 200000, 100000]);
    await expect(runtime.confirmBudgetCandidate('00000000-0000-4000-8000-0000000000a1'))
      .rejects.toThrow('Selected budget candidate is no longer available');
    expect((await runtime.listCurrentMonthBudgetCandidates())).toHaveLength(3);
    runtime.lock();
    await expect(runtime.listCurrentMonthBudgetCandidates()).rejects.toThrow('Vault session is locked');
    await runtime.unlock('4829517304');
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(100000);
  } finally {
    runtime.close();
  }
});

it('rejects budget confirmation when cloud conflict is reported, preserving encrypted candidates', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `budget-cloud-conflict-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '예산 충돌 테스트', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 100000 });
    await runtime.saveBudget({ limitMinor: 200000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    // Simulate an existing cloud conflict without contacting a real account.
    Object.defineProperty(runtime, 'cloudConflict', { value: true, configurable: true });
    expect(runtime.hasCloudConflict()).toBe(true);
    await expect(runtime.confirmBudgetCandidate(before[1]!.id))
      .rejects.toThrow('Cloud conflict must be resolved');
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(200000);
  } finally {
    runtime.close();
  }
});

it('preserves interleaved budget records from two unlocked sessions', async () => {
  const dbName = `budget-stale-${crypto.randomUUID()}`;
  const now = () => new Date('2026-10-19T05:00:00.000Z');
  const first = await BrowserRuntime.open({ dbName, argon2Profile: 'test', now });
  const second = await BrowserRuntime.open({ dbName, argon2Profile: 'test', now });
  try {
    await first.createProfile({ nickname: '예산 동시 저장 검증', pin: '4829517304' });
    await second.unlock('4829517304');
    await first.saveBudget({ limitMinor: 100000 });
    const candidates = await first.listCurrentMonthBudgetCandidates();
    // The second session commits a newer budget while the first is still unlocked.
    await second.saveBudget({ limitMinor: 200000 });
    // A user-selected historical choice appends a record after the other session's
    // update; all existing candidates must remain intact.
    await first.confirmBudgetCandidate(candidates[0]!.id);
    const after = await first.listCurrentMonthBudgetCandidates();
    expect(after.map((item) => item.limitMinor)).toEqual([100000, 200000, 100000]);
    first.lock();
    await first.unlock('4829517304');
    expect(first.getSnapshot().dashboard.budget.limitMinor).toBe(100000);
  } finally {
    first.close();
    second.close();
  }
});

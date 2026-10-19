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

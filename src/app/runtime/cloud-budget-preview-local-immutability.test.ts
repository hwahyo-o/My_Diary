import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('does not mutate local budget history when disconnected cloud comparison fails', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `cloud-preview-immutable-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-20T01:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '읽기 전용 비교 테스트', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 100000 });
    await runtime.saveBudget({ limitMinor: 200000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    const dashboardBefore = runtime.getSnapshot().dashboard.budget.limitMinor;
    await expect(runtime.previewCloudBudgetComparison()).rejects.toThrow('Unlock the connected Vault');
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(dashboardBefore);
    runtime.lock();
    await runtime.unlock('4829517304');
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
  } finally {
    runtime.close();
  }
});

import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('refuses cloud budget preview while Vault is unconnected or locked without changing local history', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `cloud-budget-preview-guard-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '미연결 예산 비교', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 100000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    await expect(runtime.previewCloudBudgetComparison())
      .rejects.toThrow('Unlock the connected Vault');
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
    runtime.lock();
    await expect(runtime.previewCloudBudgetComparison())
      .rejects.toThrow('Unlock the connected Vault');
    await runtime.unlock('4829517304');
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
  } finally {
    runtime.close();
  }
});

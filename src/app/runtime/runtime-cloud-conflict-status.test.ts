import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('exposes a fail-closed conflict status and refuses to confirm budgets while conflict is active', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `runtime-status-conflict-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-20T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: 'conflict-status-test', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 100000 });
    await runtime.saveBudget({ limitMinor: 200000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    Object.defineProperty(runtime, 'cloudConflict', { configurable: true, value: true });
    expect(runtime.hasCloudConflict()).toBe(true);
    expect(runtime.getCloudSyncStatus()).toBe('conflict');
    await expect(runtime.confirmBudgetCandidate(before[1]!.id, before[0]!.id))
      .rejects.toThrow('Cloud conflict must be resolved');
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
  } finally {
    runtime.close();
  }
});

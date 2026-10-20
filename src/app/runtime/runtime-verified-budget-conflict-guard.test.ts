import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('does not fetch or expose conflict amounts without an unlocked connected conflict state', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `cloud-conflict-preview-guard-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-20T07:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: 'conflict-preview-test', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 150000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    await expect(runtime.previewVerifiedBudgetConflicts()).rejects.toThrow('Unlock a connected Vault');
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
    runtime.lock();
    await expect(runtime.previewVerifiedBudgetConflicts()).rejects.toThrow('Unlock a connected Vault');
  } finally {
    runtime.close();
  }
});

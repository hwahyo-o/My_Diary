import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('refuses acknowledgement recovery without a connected hard-conflict Vault', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `cloud-ack-recovery-${crypto.randomUUID()}`,
    argon2Profile: 'test', now: () => new Date('2026-10-21T06:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: 'ack-test', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 140000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    await expect(runtime.recoverCloudResolutionAcknowledgement(
      { kind: 'acknowledged', serverRevision: 5 }, 1,
    )).rejects.toThrow('Connected unlocked Vault');
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
  } finally { runtime.close(); }
});

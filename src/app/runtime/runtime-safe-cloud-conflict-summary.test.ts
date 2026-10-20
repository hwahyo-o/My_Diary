import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('returns no conflict summary for a newly unlocked local Vault', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `cloud-conflict-summary-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-20T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: 'summary-test', pin: '4829517304' });
    expect(runtime.hasCloudConflict()).toBe(false);
    expect(runtime.getCloudConflictSummary()).toBeNull();
  } finally {
    runtime.close();
  }
});

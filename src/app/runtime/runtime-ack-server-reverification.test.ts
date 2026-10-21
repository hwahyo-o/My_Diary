import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
afterEach(() => vi.unstubAllGlobals());
const digest = 'ab'.repeat(32);
it.each([
  { revision: 5, objectSha256: digest, accepted: true },
  { revision: 6, objectSha256: digest, accepted: false },
  { revision: 5, objectSha256: 'cd'.repeat(32), accepted: false },
])('reverifies server HEAD before recovering acknowledged cloud metadata %j', async ({ revision, objectSha256, accepted }) => {
  const runtime = await BrowserRuntime.open({
    dbName: `ack-server-verify-${crypto.randomUUID()}`,
    argon2Profile: 'test', now: () => new Date('2026-10-21T06:00:00.000Z'),
  });
  const getHead = vi.fn().mockResolvedValue({ revision, objectSha256, updatedAt: null });
  try {
    await runtime.createProfile({ nickname: 'ack-server-test', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 140000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    const localRevision = await Reflect.get(runtime, 'repository').getRevision(Reflect.get(runtime, 'bootstrap').vaultId);
    Object.defineProperty(runtime, 'cloudConflict', { value: true, configurable: true });
    Object.defineProperty(runtime, 'cloudMeta', { value: {
      accountId: 'synthetic', nickname: 'ack-server-test', accountSalt: new Uint8Array([1]),
      cloudWrap: {}, cloudRevision: 4, localRevisionAtSync: -1,
    }, configurable: true, writable: true });
    Object.defineProperty(runtime, 'cloudClient', { value: { getHead }, configurable: true });
    const action = runtime.recoverCloudResolutionAcknowledgement(
      { kind: 'acknowledged', serverRevision: 5 }, localRevision, digest,
    );
    if (accepted) await expect(action).resolves.toBeUndefined();
    else await expect(action).rejects.toThrow('no longer matches');
    expect(runtime.hasCloudConflict()).toBe(true);
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
    expect(getHead).toHaveBeenCalledTimes(1);
  } finally { runtime.close(); }
});

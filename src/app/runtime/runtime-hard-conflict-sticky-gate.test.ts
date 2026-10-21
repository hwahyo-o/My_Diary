import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('refuses subsequent automatic sync retries while a hard conflict remains unresolved', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `cloud-conflict-sticky-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-21T03:00:00.000Z'),
  });
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  try {
    await runtime.createProfile({ nickname: 'conflict-sticky-test', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 170000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    Object.defineProperty(runtime, 'cloudConflict', { value: true, configurable: true });
    const sync = Reflect.get(runtime, 'syncCloudNow') as () => Promise<void>;
    await expect(sync.call(runtime)).rejects.toThrow('Cloud conflict must be resolved');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(runtime.hasCloudConflict()).toBe(true);
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
  } finally {
    fetchSpy.mockRestore();
    runtime.close();
  }
});

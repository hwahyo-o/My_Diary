import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('rejects direct cloud snapshot upload before reading or sending protected records', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `hard-conflict-upload-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-21T03:00:00.000Z'),
  });
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  try {
    await runtime.createProfile({ nickname: 'test-conflict-upload', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 180000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    Object.defineProperty(runtime, 'cloudConflict', { value: true, configurable: true });
    const upload = Reflect.get(runtime, 'uploadCloudSnapshot') as
      (meta: unknown, revision: number) => Promise<void>;
    await expect(upload.call(runtime, null, 0)).rejects.toThrow(
      'Cloud conflict must be resolved before uploading.',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(runtime.hasCloudConflict()).toBe(true);
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
  } finally {
    fetchSpy.mockRestore();
    runtime.close();
  }
});

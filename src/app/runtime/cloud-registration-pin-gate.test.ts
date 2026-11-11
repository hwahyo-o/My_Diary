import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

afterEach(() => vi.unstubAllGlobals());

it('does not create a remote cloud account when the local Vault PIN is incorrect', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error('No network calls expected'));
  vi.stubGlobal('fetch', fetchMock);
  const runtime = await BrowserRuntime.open({
    dbName: `reject-cloud-registration-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-11-09T00:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '잘못된핀검증', pin: '4829517304' });
    await expect(runtime.enrollCloud({ pin: '9273846510' })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runtime.isCloudEnrolled()).toBe(false);
  } finally {
    runtime.close();
  }
});

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
import { CloudSyncClient } from '../../cloud-sync/http-client';

afterEach(() => vi.restoreAllMocks());

it('does not report successful sync if network fails, and clears stale status when locked', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `status-regression-${crypto.randomUUID()}`,
    argon2Profile: 'test',
  });
  await runtime.createProfile({ nickname: '테스트 전용', pin: '4829517304' });
  const internal = runtime as unknown as {
    cloudMeta: unknown;
    cloudKek: Uint8Array | null;
    syncCloudBestEffort(): Promise<void>;
  };
  internal.cloudMeta = {
    accountId: 'test-account',
    nickname: '테스트 전용',
    accountSalt: new Uint8Array(32),
    cloudWrap: { algorithm: 'AES-GCM', iv: new Uint8Array(12), ciphertext: new Uint8Array(48) },
    cloudRevision: 0,
    localRevisionAtSync: -1,
  };
  internal.cloudKek = crypto.getRandomValues(new Uint8Array(32));
  vi.spyOn(CloudSyncClient.prototype, 'getHead').mockRejectedValue(new TypeError('offline'));
  try {
    await internal.syncCloudBestEffort();
    expect(runtime.getSnapshot().cloudSyncStatus).toBe('error');
    runtime.lock();
    expect(runtime.getSnapshot().access).toBe('locked');
    expect(runtime.getSnapshot().cloudSyncStatus).toBe('pending');
  } finally {
    runtime.close();
  }
});

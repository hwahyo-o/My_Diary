import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
import { CloudSyncClient } from '../../cloud-sync/http-client';
import { openVaultDatabase, STORE_NAMES } from '../../storage/database';

type SyncTestRuntime = {
  cloudMeta: unknown;
  cloudKek: Uint8Array | null;
  syncCloudBestEffort(): Promise<void>;
};

const pin = '4829517304';
async function allRecords(dbName: string): Promise<unknown[]> {
  const db = await openVaultDatabase(dbName);
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAMES.records, 'readonly').objectStore(STORE_NAMES.records).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function setup() {
  const dbName = `cloud-failure-${crypto.randomUUID()}`;
  const runtime = await BrowserRuntime.open({ dbName, argon2Profile: 'test' });
  await runtime.createProfile({ nickname: '격리 테스트', pin });
  const testRuntime = runtime as unknown as SyncTestRuntime;
  testRuntime.cloudMeta = {
    accountId: 'test-only-cloud-account',
    nickname: '격리 테스트',
    accountSalt: new Uint8Array(32),
    cloudWrap: { algorithm: 'AES-GCM', iv: new Uint8Array(12), ciphertext: new Uint8Array(48) },
    cloudRevision: 0,
    localRevisionAtSync: -1,
  };
  testRuntime.cloudKek = crypto.getRandomValues(new Uint8Array(32));
  return { dbName, runtime, testRuntime };
}

afterEach(() => vi.restoreAllMocks());

describe('runtime local-first cloud failure integration', () => {
  it.each(['offline', '409-conflict', '503-outage'])(
    'preserves encrypted IndexedDB records after %s upload failure, then retries without duplicate records',
    async (scenario) => {
      const { dbName, runtime, testRuntime } = await setup();
      const headSpy = vi.spyOn(CloudSyncClient.prototype, 'getHead').mockResolvedValue({ revision: 0, objectSha256: null, updatedAt: null });
      const uploadSpy = vi.spyOn(CloudSyncClient.prototype, 'uploadSnapshot')
        .mockRejectedValueOnce(new Error(scenario))
        .mockResolvedValueOnce({ revision: 1 });
      try {
        const before = await allRecords(dbName);
        expect(before.length).toBeGreaterThan(0);
        await testRuntime.syncCloudBestEffort();
        expect(await allRecords(dbName)).toEqual(before);
        expect((testRuntime.cloudMeta as { cloudRevision: number }).cloudRevision).toBe(0);
        await testRuntime.syncCloudBestEffort();
        expect(uploadSpy).toHaveBeenCalledTimes(2);
        expect(headSpy).toHaveBeenCalledTimes(2);
        expect(await allRecords(dbName)).toEqual(before);
        expect((testRuntime.cloudMeta as { cloudRevision: number }).cloudRevision).toBe(1);
        const [first, second] = uploadSpy.mock.calls.map(([args]) => args);
        expect(first?.bytes).toBeInstanceOf(Uint8Array);
        expect(second?.bytes).toBeInstanceOf(Uint8Array);
        expect(first?.expectedRevision).toBe(0);
        expect(second?.expectedRevision).toBe(0);
      } finally {
        runtime.close();
      }
    },
  );

  it('keeps local encrypted data if fetching server head fails before upload', async () => {
    const { dbName, runtime, testRuntime } = await setup();
    const headSpy = vi.spyOn(CloudSyncClient.prototype, 'getHead')
      .mockRejectedValueOnce(new Error('network disconnected'))
      .mockResolvedValueOnce({ revision: 0, objectSha256: null, updatedAt: null });
    const uploadSpy = vi.spyOn(CloudSyncClient.prototype, 'uploadSnapshot')
      .mockResolvedValueOnce({ revision: 1 });
    try {
      const before = await allRecords(dbName);
      await testRuntime.syncCloudBestEffort();
      expect(uploadSpy).not.toHaveBeenCalled();
      expect(await allRecords(dbName)).toEqual(before);
      await testRuntime.syncCloudBestEffort();
      expect(headSpy).toHaveBeenCalledTimes(2);
      expect(uploadSpy).toHaveBeenCalledTimes(1);
      expect(await allRecords(dbName)).toEqual(before);
    } finally {
      runtime.close();
    }
  });
});

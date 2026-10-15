import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
import { CloudSyncClient, CloudSyncHttpError } from '../../cloud-sync/http-client';
import { sha256Hex } from '../../cloud-sync/snapshot';
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
        expect(ArrayBuffer.isView(first?.bytes)).toBe(true);
        expect(ArrayBuffer.isView(second?.bytes)).toBe(true);
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
  it('reconciles an upload committed by the server despite lost acknowledgement, without duplicating encrypted records', async () => {
    const { dbName, runtime, testRuntime } = await setup();
    let serverRevision = 0;
    let serverBytes: Uint8Array | null = null;
    const uploadSpy = vi.spyOn(CloudSyncClient.prototype, 'uploadSnapshot')
      .mockImplementation(async (input) => {
        if (input.expectedRevision !== serverRevision) throw new Error('409 conflict');
        serverBytes = input.bytes.slice();
        serverRevision += 1;
        if (serverRevision === 1) throw new TypeError('response lost after commit');
        return { revision: serverRevision };
      });
    vi.spyOn(CloudSyncClient.prototype, 'getHead').mockImplementation(async () => ({
      revision: serverRevision, objectSha256: serverBytes ? await sha256Hex(serverBytes) : null, updatedAt: null,
    }));
    vi.spyOn(CloudSyncClient.prototype, 'downloadSnapshot').mockImplementation(async () => {
      if (!serverBytes) return null;
      return { revision: serverRevision, objectSha256: await sha256Hex(serverBytes), bytes: serverBytes };
    });
    try {
      const before = await allRecords(dbName);
      await testRuntime.syncCloudBestEffort();
      expect(serverRevision).toBe(1);
      expect((testRuntime.cloudMeta as { cloudRevision: number }).cloudRevision).toBe(0);
      expect(await allRecords(dbName)).toEqual(before);
      await testRuntime.syncCloudBestEffort();
      expect(uploadSpy).toHaveBeenCalledTimes(2);
      expect(serverRevision).toBe(2);
      expect((testRuntime.cloudMeta as { cloudRevision: number }).cloudRevision).toBe(2);
      expect(await allRecords(dbName)).toEqual(before);
    } finally { runtime.close(); }
  });

  it('rechecks remote head and reconciles after a concurrent CAS 409 instead of losing local records', async () => {
    const { dbName, runtime, testRuntime } = await setup();
    let revision = 0;
    let committedBytes: Uint8Array | null = null;
    const uploadSpy = vi.spyOn(CloudSyncClient.prototype, 'uploadSnapshot')
      .mockImplementation(async (input) => {
        if (revision === 0) {
          // A competing device committed the same baseline before our upload.
          committedBytes = input.bytes.slice();
          revision = 1;
          throw new CloudSyncHttpError('stale expected revision', 409);
        }
        expect(input.expectedRevision).toBe(revision);
        committedBytes = input.bytes.slice();
        return { revision: ++revision };
      });
    const headSpy = vi.spyOn(CloudSyncClient.prototype, 'getHead').mockImplementation(async () => ({
      revision, objectSha256: committedBytes ? await sha256Hex(committedBytes) : null, updatedAt: null,
    }));
    vi.spyOn(CloudSyncClient.prototype, 'downloadSnapshot').mockImplementation(async () => committedBytes
      ? { revision, objectSha256: await sha256Hex(committedBytes), bytes: committedBytes }
      : null);
    try {
      const before = await allRecords(dbName);
      await testRuntime.syncCloudBestEffort();
      expect(headSpy).toHaveBeenCalledTimes(2);
      expect(uploadSpy).toHaveBeenCalledTimes(2);
      expect(revision).toBe(2);
      expect(await allRecords(dbName)).toEqual(before);
      expect((testRuntime.cloudMeta as { cloudRevision: number }).cloudRevision).toBe(2);
    } finally { runtime.close(); }
  });

  it('does not apply a delayed cloud head response after the Vault is locked', async () => {
    const { dbName, runtime, testRuntime } = await setup();
    let releaseHead: ((value: { revision: number; objectSha256: null; updatedAt: null }) => void) | undefined;
    const headStarted = new Promise<void>((resolve) => {
      vi.spyOn(CloudSyncClient.prototype, 'getHead').mockImplementation(() => {
        resolve();
        return new Promise((done) => { releaseHead = done; });
      });
    });
    const upload = vi.spyOn(CloudSyncClient.prototype, 'uploadSnapshot');
    const download = vi.spyOn(CloudSyncClient.prototype, 'downloadSnapshot');
    try {
      const before = await allRecords(dbName);
      const pending = testRuntime.syncCloudBestEffort();
      await headStarted;
      runtime.lock();
      releaseHead?.({ revision: 1, objectSha256: null, updatedAt: null });
      await pending;
      expect(upload).not.toHaveBeenCalled();
      expect(download).not.toHaveBeenCalled();
      expect(await allRecords(dbName)).toEqual(before);
      expect(runtime.getSnapshot().access).toBe('locked');
    } finally { runtime.close(); }
  });

  it('keeps transactions written while an upload is in-flight and sends them in a later revision', async () => {
    const { dbName, runtime, testRuntime } = await setup();
    let releaseFirst: ((result: { revision: number }) => void) | undefined;
    let firstStarted: (() => void) | undefined;
    const firstReached = new Promise<void>((resolve) => { firstStarted = resolve; });
    const uploaded: Uint8Array[] = [];
    let revision = 0;
    vi.spyOn(CloudSyncClient.prototype, 'getHead').mockImplementation(async () => ({
      revision, objectSha256: null, updatedAt: null,
    }));
    const upload = vi.spyOn(CloudSyncClient.prototype, 'uploadSnapshot').mockImplementation(async (input) => {
      expect(input.expectedRevision).toBe(revision);
      uploaded.push(input.bytes.slice());
      if (uploaded.length === 1) {
        firstStarted?.();
        return new Promise((resolve) => { releaseFirst = resolve; });
      }
      revision += 1;
      return { revision };
    });
    try {
      const first = testRuntime.syncCloudBestEffort();
      await firstReached;
      await runtime.submitTransaction({ mode: 'quick', text: '커피 4500' });
      const afterLocalWrite = await allRecords(dbName);
      expect(afterLocalWrite.length).toBeGreaterThan(1);
      revision = 1;
      releaseFirst?.({ revision });
      await first;
      expect(await allRecords(dbName)).toEqual(afterLocalWrite);
      await testRuntime.syncCloudBestEffort();
      expect(upload).toHaveBeenCalledTimes(2);
      expect(uploaded[0]).not.toEqual(uploaded[1]);
      expect((testRuntime.cloudMeta as { localRevisionAtSync: number }).localRevisionAtSync).toBeGreaterThan(0);
      expect(await allRecords(dbName)).toEqual(afterLocalWrite);
    } finally { runtime.close(); }
  });

  it('preserves several sequential quick transactions through repeated outages, then uploads exactly once', async () => {
    const { dbName, runtime, testRuntime } = await setup();
    const upload = vi.spyOn(CloudSyncClient.prototype, 'uploadSnapshot')
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new Error('503 outage'))
      .mockResolvedValueOnce({ revision: 1 });
    vi.spyOn(CloudSyncClient.prototype, 'getHead').mockResolvedValue({
      revision: 0, objectSha256: null, updatedAt: null,
    });
    try {
      for (const text of ['아침 3500', '점심 7500', '저녁 9000']) {
        await runtime.submitTransaction({ mode: 'quick', text });
      }
      const before = await allRecords(dbName);
      expect(before.length).toBeGreaterThanOrEqual(4);
      await testRuntime.syncCloudBestEffort();
      await testRuntime.syncCloudBestEffort();
      expect(await allRecords(dbName)).toEqual(before);
      await testRuntime.syncCloudBestEffort();
      expect(upload).toHaveBeenCalledTimes(3);
      expect(await allRecords(dbName)).toEqual(before);
      expect((testRuntime.cloudMeta as { cloudRevision: number }).cloudRevision).toBe(1);
    } finally { runtime.close(); }
  });

  it('preserves local records on consecutive CAS 409 conflicts and retries on the next sync', async () => {
    const { dbName, runtime, testRuntime } = await setup();
    vi.spyOn(CloudSyncClient.prototype, 'getHead').mockResolvedValue({
      revision: 0, objectSha256: null, updatedAt: null,
    });
    const upload = vi.spyOn(CloudSyncClient.prototype, 'uploadSnapshot')
      .mockRejectedValueOnce(new CloudSyncHttpError('conflict 1', 409))
      .mockRejectedValueOnce(new CloudSyncHttpError('conflict 2', 409))
      .mockResolvedValueOnce({ revision: 1 });
    try {
      const before = await allRecords(dbName);
      await testRuntime.syncCloudBestEffort();
      expect(upload).toHaveBeenCalledTimes(2);
      expect((testRuntime.cloudMeta as { cloudRevision: number }).cloudRevision).toBe(0);
      expect(await allRecords(dbName)).toEqual(before);
      await testRuntime.syncCloudBestEffort();
      expect(upload).toHaveBeenCalledTimes(3);
      expect((testRuntime.cloudMeta as { cloudRevision: number }).cloudRevision).toBe(1);
      expect(await allRecords(dbName)).toEqual(before);
    } finally { runtime.close(); }
  });

  it('reports failed manual retry instead of claiming cloud success, then succeeds on another attempt', async () => {
    const { runtime, testRuntime } = await setup();
    vi.spyOn(CloudSyncClient.prototype, 'getHead')
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ revision: 0, objectSha256: null, updatedAt: null });
    vi.spyOn(CloudSyncClient.prototype, 'uploadSnapshot').mockResolvedValue({ revision: 1 });
    try {
      await expect(runtime.retryCloudSync()).rejects.toThrow('Cloud sync did not complete');
      expect(runtime.getSnapshot().cloudSyncStatus).toBe('error');
      await runtime.retryCloudSync();
      expect(runtime.getSnapshot().cloudSyncStatus).toBe('synced');
    } finally { runtime.close(); }
  });

});

import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
import { CloudSyncClient } from '../../cloud-sync/http-client';
import { openVaultDatabase, STORE_NAMES } from '../../storage/database';

type SyncRuntime = { cloudMeta: unknown; cloudKek: Uint8Array | null; syncCloudBestEffort(): Promise<void> };
afterEach(() => vi.restoreAllMocks());

async function encryptedRecords(dbName: string): Promise<unknown[]> {
  const db = await openVaultDatabase(dbName);
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAMES.records, 'readonly').objectStore(STORE_NAMES.records).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

it('preserves newest monthly budget when changed during cloud upload and retransmits after an outage', async () => {
  const dbName = `cloud-budget-${crypto.randomUUID()}`;
  const runtime = await BrowserRuntime.open({
    dbName, argon2Profile: 'test', now: () => new Date('2026-10-19T05:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '테스트 예산', pin: '4829517304' });
    const sync = runtime as unknown as SyncRuntime;
    sync.cloudMeta = {
      accountId: 'test-only-budget',
      nickname: '테스트 예산',
      accountSalt: new Uint8Array(32),
      cloudWrap: { algorithm: 'AES-GCM', iv: new Uint8Array(12), ciphertext: new Uint8Array(48) },
      cloudRevision: 0,
      localRevisionAtSync: -1,
    };
    sync.cloudKek = crypto.getRandomValues(new Uint8Array(32));
    await runtime.saveBudget({ limitMinor: 100000 });
    let releaseUpload: ((value: { revision: number }) => void) | undefined;
    let uploadStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { uploadStarted = resolve; });
    let serverRevision = 0;
    const payloads: Uint8Array[] = [];
    vi.spyOn(CloudSyncClient.prototype, 'getHead').mockImplementation(async () => ({
      revision: serverRevision, objectSha256: null, updatedAt: null,
    }));
    const upload = vi.spyOn(CloudSyncClient.prototype, 'uploadSnapshot').mockImplementation(async ({ bytes, expectedRevision }) => {
      expect(expectedRevision).toBe(serverRevision);
      payloads.push(bytes.slice());
      if (payloads.length === 1) {
        uploadStarted?.();
        return new Promise((resolve) => { releaseUpload = resolve; });
      }
      serverRevision += 1;
      return { revision: serverRevision };
    });
    const first = sync.syncCloudBestEffort();
    await started;
    await runtime.saveBudget({ limitMinor: 20000 });
    const localBefore = await encryptedRecords(dbName);
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(20000);
    serverRevision = 1;
    releaseUpload?.({ revision: 1 });
    await first;
    expect(runtime.getSnapshot().cloudSyncStatus).toBe('pending');
    expect(await encryptedRecords(dbName)).toEqual(localBefore);
    await sync.syncCloudBestEffort();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(payloads[0]).not.toEqual(payloads[1]);
    expect(runtime.getSnapshot().cloudSyncStatus).toBe('synced');
    runtime.lock();
    await runtime.unlock('4829517304');
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(20000);
  } finally { runtime.close(); }
});

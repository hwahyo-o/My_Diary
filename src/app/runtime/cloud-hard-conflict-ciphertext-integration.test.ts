import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
import { openVaultDatabase, STORE_NAMES } from '../../storage/database';
import { EncryptedRepository } from '../../storage/repository';

afterEach(() => vi.unstubAllGlobals());

it('preserves remote ciphertext and local primary record when cloud download conflicts on the same record ID', async () => {
  const nickname = '원격충돌테스트';
  const pin = '4829517304';
  const pepper = 'AQIDBAUGBwgJCgsMDQ4PEA';
  let accountSalt = '';
  let revision = 0;
  let bytes: Uint8Array | null = null;
  let digest = '';
  let uploads = 0;
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/account/register') {
      accountSalt = (JSON.parse(String(init?.body)) as { accountSalt: string }).accountSalt;
      return json({ accountId: 'integration-account', unlockPepper: pepper, revision: 0 });
    }
    if (url === '/api/account/challenge') return json({ accountSalt });
    if (url === '/api/account/login') return json({ accountId: 'integration-account', unlockPepper: pepper, revision });
    if (url === '/api/sync/head') return json({ revision, objectSha256: digest || null, updatedAt: null });
    if (url === '/api/sync/upload') {
      const headers = init?.headers as Record<string, string>;
      if (Number(headers['x-my-diary-expected-revision']) !== revision) return json({ error: 'Revision conflict' }, 409);
      bytes = new Uint8Array(init?.body as ArrayBuffer);
      digest = headers['x-my-diary-sha256'] ?? '';
      uploads++;
      revision++;
      return json({ revision });
    }
    if (url === '/api/sync/download') {
      if (!bytes) return new Response(null, { status: 204 });
      return new Response(bytes.slice(), { status: 200, headers: {
        'x-my-diary-revision': String(revision), 'x-my-diary-sha256': digest,
      } });
    }
    throw new Error(`Unmocked endpoint: ${url}`);
  }));

  const nameA = `cloud-conflict-A-${crypto.randomUUID()}`;
  const nameB = `cloud-conflict-B-${crypto.randomUUID()}`;
  const now = () => new Date('2026-10-20T03:00:00.000Z');
  const first = await BrowserRuntime.open({ dbName: nameA, argon2Profile: 'test', now });
  const second = await BrowserRuntime.open({ dbName: nameB, argon2Profile: 'test', now });
  let dbA: IDBDatabase | undefined;
  let dbB: IDBDatabase | undefined;
  try {
    await first.createProfile({ nickname, pin });
    await first.saveBudget({ limitMinor: 170000 });
    await first.enrollCloud({ pin });
    await second.loginFromCloud({ nickname, pin });
    dbA = await openVaultDatabase(nameA);
    dbB = await openVaultDatabase(nameB);
    const repoA = new EncryptedRepository(dbA);
    const repoB = new EncryptedRepository(dbB);
    const baselineIds = new Set((await repoB.listAllRecords()).map(record => record.recordId));

    await first.saveBudget({ limitMinor: 210000 });
    await first.retryCloudSync();
    const remote = (await repoA.listAllRecords()).find(record => !baselineIds.has(record.recordId));
    expect(remote).toBeDefined();
    const originalLocal = (await repoB.listAllRecords()).find(record => record.recordType === 'budget');
    expect(originalLocal).toBeDefined();

    // A controlled same-ID divergence at the persistence boundary:
    // preserve the local ciphertext bytes, but give it the remote record identity.
    // The conflict guard must refuse reconciliation BEFORE decrypting either candidate.
    const divergedLocal = { ...originalLocal!, recordId: remote!.recordId };
    const tx = dbB.transaction([STORE_NAMES.records, STORE_NAMES.vaultMeta], 'readwrite');
    tx.objectStore(STORE_NAMES.records).put(divergedLocal);
    const metaStore = tx.objectStore(STORE_NAMES.vaultMeta);
    const allMeta = metaStore.getAll();
    allMeta.onsuccess = () => {
      for (const meta of allMeta.result as Array<{ vaultId: string; revision: number; schemaVersion: number }>) {
        metaStore.put({ ...meta, revision: meta.revision + 1 });
      }
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
      tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
    });

    const beforeUploads = uploads;
    await expect(second.retryCloudSync()).rejects.toThrow('local records are preserved');
    expect(second.getCloudSyncStatus()).toBe('conflict');
    expect(uploads).toBe(beforeUploads);
    const variants = await repoB.listConflictVariants(remote!.recordId);
    expect(variants).toHaveLength(1);
    expect(variants[0]!.source).toBe('cloud');
    expect(Array.from(variants[0]!.encryptedPayload)).toEqual(Array.from(remote!.encryptedPayload));
    const primary = (await repoB.listAllRecords()).find(record => record.recordId === remote!.recordId);
    expect(Array.from(primary!.encryptedPayload)).toEqual(Array.from(divergedLocal.encryptedPayload));

    // A second retry cannot replace either copy or upload an unresolved conflict.
    await expect(second.retryCloudSync()).rejects.toThrow('local records are preserved');
    expect(await repoB.listConflictVariants(remote!.recordId)).toHaveLength(1);
    expect(uploads).toBe(beforeUploads);
  } finally {
    dbA?.close();
    dbB?.close();
    first.close();
    second.close();
  }
});

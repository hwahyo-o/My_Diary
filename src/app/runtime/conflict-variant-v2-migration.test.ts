import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase, STORE_NAMES } from '../../storage/database';
import { EncryptedRepository } from '../../storage/repository';

it('migrates existing v1 Vault without losing original encrypted records', async () => {
  const name = `conflict-v2-migration-${crypto.randomUUID()}`;
  const old = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAMES.records, { keyPath: 'recordId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = old.transaction(STORE_NAMES.records, 'readwrite');
    tx.objectStore(STORE_NAMES.records).add({
      recordId: 'shared', recordType: 'budget', recordVersion: 1,
      updatedAt: '2026-10-21T06:00:00.000Z', encryptedPayload: new Uint8Array([1]),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  old.close();
  const db = await openVaultDatabase(name);
  const repo = new EncryptedRepository(db);
  try {
    expect(db.version).toBe(2);
    expect(db.objectStoreNames.contains(STORE_NAMES.conflictVariants)).toBe(true);
    expect((await repo.listAllRecords())[0]!.encryptedPayload[0]).toBe(1);
    await repo.appendConflictVariant({
      variantId: 'cloud-shared-v1', recordId: 'shared', recordType: 'budget',
      recordVersion: 1, updatedAt: '2026-10-21T06:00:00.000Z',
      encryptedPayload: new Uint8Array([2]), source: 'cloud',
    });
    await expect(repo.appendConflictVariant({
      variantId: 'cloud-shared-v1', recordId: 'shared', recordType: 'budget',
      recordVersion: 1, updatedAt: '2026-10-21T06:00:00.000Z',
      encryptedPayload: new Uint8Array([3]), source: 'cloud',
    })).rejects.toThrow();
    expect((await repo.listConflictVariants('shared'))[0]!.encryptedPayload[0]).toBe(2);
    expect((await repo.listAllRecords())[0]!.encryptedPayload[0]).toBe(1);
    await expect(repo.replaceVaultData({ vaultId: crypto.randomUUID(), schemaVersion: 1, revision: 0, records: [], events: [] }))
      .rejects.toThrow('discard encrypted conflict variants');
    await repo.replaceVaultData({ vaultId: crypto.randomUUID(), schemaVersion: 1, revision: 0, records: [], events: [], conflictVariants: await repo.listAllConflictVariants() });
    expect((await repo.listConflictVariants('shared'))[0]!.encryptedPayload[0]).toBe(2);
    await repo.clearAllData();
    expect(await repo.listConflictVariants('shared')).toHaveLength(0);
  } finally { db.close(); }
});

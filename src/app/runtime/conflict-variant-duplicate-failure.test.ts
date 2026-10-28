import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository } from '../../storage/repository';

it('keeps the primary and original cloud ciphertext intact after a duplicate-variant write fails', async () => {
  const db = await openVaultDatabase(`conflict-idempotence-${crypto.randomUUID()}`);
  const repo = new EncryptedRepository(db);
  const vaultId = crypto.randomUUID();
  const primary = {
    recordId: 'shared', recordType: 'budget', recordVersion: 1,
    updatedAt: '2026-10-28T05:00:00.000Z', encryptedPayload: new Uint8Array([1, 3, 5]),
  };
  const remote = {
    variantId: 'cloud-shared-digest', recordId: 'shared', recordType: 'budget',
    recordVersion: 1, updatedAt: '2026-10-28T05:00:00.000Z',
    encryptedPayload: new Uint8Array([2, 4, 6]), source: 'cloud' as const,
  };
  try {
    await repo.replaceVaultData({ vaultId, schemaVersion: 1, revision: 1, records: [primary], events: [] });
    await repo.appendConflictVariant(remote);
    // A duplicate insert must fail closed rather than silently replace persisted ciphertext.
    await expect(repo.appendConflictVariant({
      ...remote, encryptedPayload: new Uint8Array([9, 9, 9]),
    })).rejects.toThrow();
    const stored = await repo.listConflictVariants('shared');
    expect(stored).toHaveLength(1);
    expect(Array.from(stored[0]!.encryptedPayload)).toEqual([2, 4, 6]);
    expect(Array.from((await repo.listAllRecords())[0]!.encryptedPayload)).toEqual([1, 3, 5]);
    expect(await repo.getRevision(vaultId)).toBe(1);
    // Retrying replacement without explicitly retaining variants remains prohibited.
    await expect(repo.replaceVaultData({
      vaultId, schemaVersion: 1, revision: 2, records: [primary], events: [], expectedRevision: 1,
    })).rejects.toThrow('discard encrypted conflict variants');
    expect(Array.from((await repo.listConflictVariants('shared'))[0]!.encryptedPayload)).toEqual([2, 4, 6]);
    expect(await repo.getRevision(vaultId)).toBe(1);
  } finally { db.close(); }
});

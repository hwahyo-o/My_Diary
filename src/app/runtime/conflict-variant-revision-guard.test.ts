import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository } from '../../storage/repository';

it('fails closed on revision-checked replacement that would discard encrypted conflict variants', async () => {
  const db = await openVaultDatabase(`variant-revision-guard-${crypto.randomUUID()}`);
  const repo = new EncryptedRepository(db);
  const vaultId = crypto.randomUUID();
  const variant = {
    variantId: 'remote-shared-hash', recordId: 'shared', recordType: 'budget',
    recordVersion: 1, updatedAt: '2026-10-28T04:00:00.000Z',
    encryptedPayload: new Uint8Array([3, 7, 11]), source: 'cloud' as const,
  };
  try {
    await repo.replaceVaultData({ vaultId, schemaVersion: 1, revision: 1, records: [], events: [] });
    await repo.appendConflictVariant(variant);
    await expect(repo.replaceVaultData({
      vaultId, schemaVersion: 1, revision: 2, records: [], events: [], expectedRevision: 1,
    })).rejects.toThrow('discard encrypted conflict variants');
    expect(await repo.getRevision(vaultId)).toBe(1);
    expect(await repo.listAllConflictVariants()).toEqual([variant]);

    await repo.replaceVaultData({
      vaultId, schemaVersion: 1, revision: 2, records: [], events: [],
      conflictVariants: [variant], expectedRevision: 1,
    });
    expect(await repo.getRevision(vaultId)).toBe(2);
    expect(await repo.listAllConflictVariants()).toEqual([variant]);

    await expect(repo.replaceVaultData({
      vaultId, schemaVersion: 1, revision: 3, records: [], events: [],
      conflictVariants: [{ ...variant, encryptedPayload: new Uint8Array([99]) }],
      expectedRevision: 2,
    })).rejects.toThrow('discard encrypted conflict variants');
    expect(await repo.getRevision(vaultId)).toBe(2);
    expect(await repo.listAllConflictVariants()).toEqual([variant]);
  } finally {
    db.close();
  }
});

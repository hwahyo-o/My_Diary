import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository } from '../../storage/repository';

it('retains already saved encrypted variants when a subsequent write fails, then supports safe retry', async () => {
  const db = await openVaultDatabase(`partial-variants-${crypto.randomUUID()}`);
  const repo = new EncryptedRepository(db);
  const vaultId = crypto.randomUUID();
  const local = { recordId: 'record-a', recordType: 'budget', recordVersion: 1,
    updatedAt: '2026-10-28T05:00:00.000Z', encryptedPayload: new Uint8Array([10]) };
  const first = { variantId: 'cloud-record-a-hash', recordId: 'record-a',
    recordType: 'budget', recordVersion: 1, updatedAt: local.updatedAt,
    encryptedPayload: new Uint8Array([20]), source: 'cloud' as const };
  const second = { ...first, variantId: 'cloud-record-b-hash',
    recordId: 'record-b', encryptedPayload: new Uint8Array([30]) };
  try {
    await repo.replaceVaultData({ vaultId, schemaVersion: 1, revision: 1,
      records: [local], events: [] });
    await repo.appendConflictVariant(first);
    await expect(repo.appendConflictVariant({ ...second,
      encryptedPayload: new Uint8Array(0) })).rejects.toThrow('Invalid encrypted conflict variant');
    expect((await repo.listAllConflictVariants()).map(v => v.variantId)).toEqual([first.variantId]);
    expect(Array.from((await repo.listAllRecords())[0]!.encryptedPayload)).toEqual([10]);
    expect(await repo.getRevision(vaultId)).toBe(1);
    // On retry the previously preserved ciphertext is not overwritten.
    await repo.appendConflictVariant(second);
    const stored = await repo.listAllConflictVariants();
    expect(stored.map(v => v.variantId)).toEqual([first.variantId, second.variantId]);
    expect(stored.map(v => Array.from(v.encryptedPayload))).toEqual([[20], [30]]);
    expect(Array.from((await repo.listAllRecords())[0]!.encryptedPayload)).toEqual([10]);
    expect(await repo.getRevision(vaultId)).toBe(1);
  } finally {
    db.close();
  }
});

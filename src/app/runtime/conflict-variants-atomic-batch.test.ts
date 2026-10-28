import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository } from '../../storage/repository';

it('rolls back all newly appended cloud variants if a later batch item collides', async () => {
  const db = await openVaultDatabase(`atomic-conflicts-${crypto.randomUUID()}`);
  const repo = new EncryptedRepository(db);
  const variant = (id: string, byte: number) => ({
    variantId: id, recordId: id, recordType: 'budget', recordVersion: 1,
    updatedAt: '2026-10-28T05:00:00.000Z',
    encryptedPayload: new Uint8Array([byte]), source: 'cloud' as const,
  });
  try {
    await repo.appendConflictVariant(variant('existing', 1));
    await expect(repo.appendConflictVariantsAtomically([
      variant('new-a', 2), variant('existing', 99), variant('new-b', 3),
    ])).rejects.toThrow();
    const remaining = await repo.listAllConflictVariants();
    expect(remaining.map(v => v.variantId)).toEqual(['existing']);
    expect(Array.from(remaining[0]!.encryptedPayload)).toEqual([1]);
    await repo.appendConflictVariantsAtomically([variant('new-a', 2), variant('new-b', 3)]);
    expect((await repo.listAllConflictVariants()).map(v => v.variantId)).toEqual(['existing', 'new-a', 'new-b']);
  } finally { db.close(); }
});

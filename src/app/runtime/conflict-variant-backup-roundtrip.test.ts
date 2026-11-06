import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
import { verifyVaultPackage } from './vault-backup-package';

it('authenticates and restores encrypted conflict variants through a recovery backup', async () => {
  const source = await BrowserRuntime.open({
    dbName: `variant-roundtrip-source-${crypto.randomUUID()}`,
    argon2Profile: 'test', now: () => new Date('2026-10-22T04:00:00.000Z'),
  });
  const target = await BrowserRuntime.open({
    dbName: `variant-roundtrip-target-${crypto.randomUUID()}`,
    argon2Profile: 'test', now: () => new Date('2026-10-22T04:00:00.000Z'),
  });
  try {
    const created = await source.createProfile({ nickname: 'variant-roundtrip', pin: '4829517304' });
    const original = new Uint8Array([11, 22, 33]);
    await Reflect.get(source, 'repository').appendConflictVariant({
      variantId: 'variant-1', recordId: 'budget-1', recordType: 'budget',
      recordVersion: 1, updatedAt: '2026-10-22T04:00:00.000Z',
      source: 'cloud', encryptedPayload: original,
    });
    const backup = await source.exportVault({ recoveryKey: created.recoveryKey });
    const verified = await verifyVaultPackage(backup, created.recoveryKey);
    expect(Array.from(verified.conflictVariants[0]!.encryptedPayload)).toEqual([11, 22, 33]);
    verified.vaultKey.fill(0);
    await target.recoverFromVault({
      packageBytes: backup, recoveryKey: created.recoveryKey, pin: '7391058246',
    });
    const recovered = await Reflect.get(target, 'repository').listConflictVariants('budget-1');
    expect(recovered).toHaveLength(1);
    expect(Array.from(recovered[0]!.encryptedPayload)).toEqual([11, 22, 33]);
  } finally { source.close(); target.close(); }
});

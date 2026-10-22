import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('preserves encrypted conflict variants when invalid RecoveryKey rejects a backup', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `conflict-export-guard-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-22T04:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: 'conflict-backup-test', pin: '4829517304' });
    const repo = Reflect.get(runtime, 'repository');
    await repo.appendConflictVariant({
      variantId: 'variant-test-1', recordId: 'budget-test-1', recordType: 'budget',
      recordVersion: 1, updatedAt: '2026-10-22T04:00:00.000Z',
      source: 'cloud', encryptedPayload: new Uint8Array([1, 2, 3]),
    });
    // Invalid RecoveryKey must fail without changing preserved ciphertext.
    await expect(runtime.exportVault({ recoveryKey: 'invalid' }))
      .rejects.toThrow('Non-canonical base64url value');
    expect(await repo.listConflictVariants('budget-test-1')).toHaveLength(1);
    expect(runtime.hasCloudConflict()).toBe(false);
  } finally { runtime.close(); }
});

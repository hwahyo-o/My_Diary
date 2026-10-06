import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openVaultDatabase } from './database';
import { EncryptedRepository } from './repository';
import { assertRollbackCompatible, assertSupportedSchemaVersion } from './schema';

function dbName(): string {
  return `migration-drill-${crypto.randomUUID()}`;
}

describe('migration and rollback release drill', () => {
  it('allows the current supported schema and fails closed on future schema data', () => {
    expect(() => assertSupportedSchemaVersion(1, 1)).not.toThrow();
    expect(() => assertSupportedSchemaVersion(2, 1)).toThrow(/newer/i);
  });

  it('blocks a code rollback when the vault schema is newer than the rollback runtime', () => {
    expect(() => assertRollbackCompatible({ vaultSchemaVersion: 2, runtimeSchemaVersion: 1 })).toThrow(/rollback blocked/i);
    expect(() => assertRollbackCompatible({ vaultSchemaVersion: 1, runtimeSchemaVersion: 1 })).not.toThrow();
  });

  it('keeps an encrypted pre-migration snapshot recoverable without exposing plaintext', async () => {
    const db = await openVaultDatabase(dbName());
    try {
      const repo = new EncryptedRepository(db);
      const encryptedPayload = new Uint8Array([91, 22, 13, 204, 7]);

      await repo.putSnapshot({
        snapshotId: 'pre-migration-1',
        vaultId: 'vault-1',
        createdAt: '2026-10-02T07:50:00.000Z',
        reason: 'pre-migration',
        schemaVersion: 1,
        encryptedPayload,
      });

      const restored = await repo.getSnapshot('pre-migration-1');
      expect(restored?.reason).toBe('pre-migration');
      expect(restored?.schemaVersion).toBe(1);
      expect([...(restored?.encryptedPayload ?? [])]).toEqual([...encryptedPayload]);
    } finally {
      db.close();
    }
  });
});

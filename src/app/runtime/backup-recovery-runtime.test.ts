import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
import { openVaultDatabase, STORE_NAMES } from '../../storage/database';

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function dumpStore(dbName: string, storeName: string): Promise<unknown[]> {
  const db = await openVaultDatabase(dbName);
  try {
    const tx = db.transaction(storeName, 'readonly');
    return await requestValue(tx.objectStore(storeName).getAll());
  } finally {
    db.close();
  }
}

function tamper(bytes: Uint8Array): Uint8Array {
  const copy = bytes.slice();
  const index = Math.max(0, copy.length - 24);
  copy[index] = copy[index]! ^ 1;
  return copy;
}

describe('Encrypted backup / recovery runtime', () => {
  it('exports an authenticated .vault package without plaintext finance/profile/recovery secrets', async () => {
    const dbName = `backup-source-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({ dbName, argon2Profile: 'test' });

    try {
      const { recoveryKey } = await runtime.createProfile({ nickname: '예현', pin: '4829517304' });
      await runtime.submitTransaction({ mode: 'direct', amountMinor: 13_000, memo: '비밀 점심' });

      const backup = await runtime.exportVault({ recoveryKey });
      expect(backup.byteLength).toBeGreaterThan(200);

      const serialized = new TextDecoder().decode(backup);
      expect(serialized).toContain('FVAULT');
      expect(serialized).not.toContain('예현');
      expect(serialized).not.toContain('비밀 점심');
      expect(serialized).not.toContain('4829517304');
      expect(serialized).not.toContain(recoveryKey);

      const inspection = await runtime.inspectVaultImport(backup, { recoveryKey });
      expect(inspection.conflicts).toBe(0);
      expect(inspection.newRecords).toBe(0);
      expect(inspection.updatedRecords).toBe(0);
      expect(inspection.localOnlyRecords).toBe(0);
      expect(inspection.sameRecords).toBeGreaterThanOrEqual(2);
    } finally {
      runtime.close();
    }
  });

  it('rejects a tampered package before apply and leaves the current Vault unchanged', async () => {
    const dbName = `backup-tamper-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({ dbName, argon2Profile: 'test' });

    try {
      const { recoveryKey } = await runtime.createProfile({ nickname: '예현', pin: '4829517304' });
      await runtime.submitTransaction({ mode: 'direct', amountMinor: 13_000, memo: '점심' });
      const backup = await runtime.exportVault({ recoveryKey });
      const before = runtime.getSnapshot().dashboard.expenseMinor;

      await expect(runtime.applyVaultImport(tamper(backup), { recoveryKey })).rejects.toThrow();
      expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(before);

      const records = await dumpStore(dbName, STORE_NAMES.records);
      expect(records).toHaveLength(2);
    } finally {
      runtime.close();
    }
  });

  it('recovers an exported Vault on a fresh device with a new PIN and new local device secret', async () => {
    const sourceDb = `backup-source-${crypto.randomUUID()}`;
    const source = await BrowserRuntime.open({ dbName: sourceDb, argon2Profile: 'test' });
    const targetDb = `backup-target-${crypto.randomUUID()}`;
    const target = await BrowserRuntime.open({ dbName: targetDb, argon2Profile: 'test' });

    try {
      const { recoveryKey } = await source.createProfile({ nickname: '예현', pin: '4829517304' });
      await source.submitTransaction({ mode: 'quick', text: '택시 18000' });
      const backup = await source.exportVault({ recoveryKey });

      await target.recoverFromVault({ packageBytes: backup, recoveryKey, pin: '7319052846' });
      expect(target.getSnapshot().access).toBe('unlocked');
      expect(target.getSnapshot().dashboard.nickname).toBe('예현');
      expect(target.getSnapshot().dashboard.expenseMinor).toBe(18_000);

      target.lock();
      await expect(target.unlock('4829517304')).rejects.toThrow();
      await target.unlock('7319052846');
      expect(target.getSnapshot().dashboard.expenseMinor).toBe(18_000);

      const security = JSON.stringify(await dumpStore(targetDb, STORE_NAMES.securityMeta));
      expect(security).not.toContain(recoveryKey);
      expect(security).not.toContain('4829517304');
      expect(security).not.toContain('7319052846');
    } finally {
      source.close();
      target.close();
    }
  });

  it('rejects a wrong RecoveryKey on a fresh device without creating a local bootstrap', async () => {
    const source = await BrowserRuntime.open({ dbName: `backup-source-${crypto.randomUUID()}`, argon2Profile: 'test' });
    const targetDb = `backup-target-${crypto.randomUUID()}`;
    const target = await BrowserRuntime.open({ dbName: targetDb, argon2Profile: 'test' });

    try {
      const { recoveryKey } = await source.createProfile({ nickname: '예현', pin: '4829517304' });
      const backup = await source.exportVault({ recoveryKey });
      const wrongRecoveryKey = `${recoveryKey.slice(0, -1)}${recoveryKey.endsWith('A') ? 'B' : 'A'}`;

      await expect(target.recoverFromVault({
        packageBytes: backup,
        recoveryKey: wrongRecoveryKey,
        pin: '7319052846',
      })).rejects.toThrow();

      expect(target.getSnapshot().access).toBe('onboarding');
      expect(await dumpStore(targetDb, STORE_NAMES.securityMeta)).toHaveLength(0);
      expect(await dumpStore(targetDb, STORE_NAMES.records)).toHaveLength(0);
    } finally {
      source.close();
      target.close();
    }
  });
});

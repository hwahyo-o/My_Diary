import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
import { openVaultDatabase, STORE_NAMES } from '../../storage/database';

async function recordsFrom(dbName: string, storeName: string): Promise<unknown[]> {
  const db = await openVaultDatabase(dbName);
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

describe('P0 financial backup integrity', () => {
  it('retains several financial transactions, ledger events, and dashboard totals across Vault recovery', async () => {
    const firstDb = `p0-source-${crypto.randomUUID()}`;
    const secondDb = `p0-recovered-${crypto.randomUUID()}`;
    const source = await BrowserRuntime.open({ dbName: firstDb, argon2Profile: 'test' });
    const restored = await BrowserRuntime.open({ dbName: secondDb, argon2Profile: 'test' });
    try {
      const profile = await source.createProfile({ nickname: '테스트 전용', pin: '4829517304' });
      for (const text of ['월급 2000000', '아침 3500', '점심 7500', '커피 4200']) {
        await source.submitTransaction({ mode: 'quick', text });
      }
      const before = source.getSnapshot();
      const encryptedRecords = await recordsFrom(firstDb, STORE_NAMES.records);
      const ledgerEvents = await recordsFrom(firstDb, STORE_NAMES.events);
      const encryptedBackup = await source.exportVault({ recoveryKey: profile.recoveryKey });
      await restored.recoverFromVault({
        packageBytes: encryptedBackup,
        recoveryKey: profile.recoveryKey,
        pin: '7391058246',
      });
      const after = restored.getSnapshot();
      expect(after.dashboard.incomeMinor).toBe(before.dashboard.incomeMinor);
      expect(after.dashboard.expenseMinor).toBe(before.dashboard.expenseMinor);
      expect(after.dashboard.balanceMinor).toBe(before.dashboard.balanceMinor);
      expect(await recordsFrom(secondDb, STORE_NAMES.records)).toEqual(encryptedRecords);
      expect(await recordsFrom(secondDb, STORE_NAMES.events)).toEqual(ledgerEvents);
      restored.lock();
      await restored.unlock('7391058246');
      expect(restored.getSnapshot().dashboard.balanceMinor).toBe(before.dashboard.balanceMinor);
    } finally {
      source.close();
      restored.close();
    }
  });
});

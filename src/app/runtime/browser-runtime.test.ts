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

describe('BrowserRuntime composition', () => {
  it('creates an encrypted profile and never persists PIN, nickname, or RecoveryKey plaintext', async () => {
    const dbName = `runtime-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({ dbName, argon2Profile: 'test' });

    try {
      const result = await runtime.createProfile({ nickname: '예현', pin: '4829517304' });
      expect(result.recoveryKey).toMatch(/^[A-Za-z0-9_-]{40,}$/);
      expect(runtime.getSnapshot().access).toBe('unlocked');
      expect(runtime.getSnapshot().dashboard.nickname).toBe('예현');

      const records = await dumpStore(dbName, STORE_NAMES.records);
      const security = await dumpStore(dbName, STORE_NAMES.securityMeta);
      const serialized = JSON.stringify({ records, security });
      expect(serialized).not.toContain('예현');
      expect(serialized).not.toContain('4829517304');
      expect(serialized).not.toContain(result.recoveryKey);
    } finally {
      runtime.close();
    }
  });

  it('fails closed on a wrong PIN and unlocks/hydrates the encrypted profile with the correct PIN', async () => {
    const dbName = `runtime-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({ dbName, argon2Profile: 'test' });

    try {
      await runtime.createProfile({ nickname: '예현', pin: '4829517304' });
      runtime.lock();
      expect(runtime.getSnapshot().access).toBe('locked');
      expect(runtime.getSnapshot().dashboard.nickname).toBe('');

      await expect(runtime.unlock('9382716405')).rejects.toThrow();
      expect(runtime.getSnapshot().access).toBe('locked');

      await runtime.unlock('4829517304');
      expect(runtime.getSnapshot().access).toBe('unlocked');
      expect(runtime.getSnapshot().dashboard.nickname).toBe('예현');
    } finally {
      runtime.close();
    }
  });

  it('routes Quick and Direct submissions through encrypted ledger storage and refreshes dashboard totals', async () => {
    const dbName = `runtime-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({
      dbName,
      argon2Profile: 'test',
      now: () => new Date('2026-10-02T12:00:00+09:00'),
    });

    try {
      await runtime.createProfile({ nickname: '예현', pin: '4829517304' });
      await runtime.submitTransaction({ mode: 'direct', amountMinor: 13000, memo: '점심' });
      await runtime.submitTransaction({ mode: 'quick', text: '택시 18000' });
      await runtime.submitTransaction({ mode: 'quick', text: '월급 50000' });

      const dashboard = runtime.getSnapshot().dashboard;
      expect(dashboard.incomeMinor).toBe(50000);
      expect(dashboard.expenseMinor).toBe(31000);
      expect(dashboard.todayReceipt.transactionCount).toBe(3);
      expect(dashboard.todayReceipt.expenseMinor).toBe(31000);

      const records = await dumpStore(dbName, STORE_NAMES.records);
      const serialized = JSON.stringify(records);
      expect(serialized).not.toContain('점심');
      expect(serialized).not.toContain('택시');
      expect(serialized).not.toContain('월급');
    } finally {
      runtime.close();
    }
  });

  it('stores quick relative dates using Korea calendar dates around UTC day boundaries', async () => {
    const dbName = `runtime-kst-date-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({
      dbName,
      argon2Profile: 'test',
      now: () => new Date('2026-10-13T15:30:00.000Z'),
    });

    try {
      await runtime.createProfile({ nickname: '날짜 테스트', pin: '4829517304' });
      await runtime.submitTransaction({ mode: 'quick', text: '그제 점심 8000' });

      const [transaction] = runtime.getSnapshot().calendar.transactions;
      expect(transaction?.occurredAt).toContain('2026-10-12');
    } finally {
      runtime.close();
    }
  });

  it('round-trips an encrypted backup into a fresh runtime and unlocks with a new PIN', async () => {
    const sourceDbName = `runtime-source-${crypto.randomUUID()}`;
    const targetDbName = `runtime-target-${crypto.randomUUID()}`;
    const source = await BrowserRuntime.open({
      dbName: sourceDbName,
      argon2Profile: 'test',
      now: () => new Date('2026-10-12T06:16:53.867Z'),
    });
    const target = await BrowserRuntime.open({
      dbName: targetDbName,
      argon2Profile: 'test',
      now: () => new Date('2026-10-12T06:20:00.000Z'),
    });

    try {
      const created = await source.createProfile({ nickname: '복구 훈련', pin: '4829517304' });
      await source.submitTransaction({ mode: 'quick', text: '복구훈련 3,000원' });

      const sourceSnapshot = source.getSnapshot();
      expect(sourceSnapshot.dashboard.expenseMinor).toBe(3000);
      expect(sourceSnapshot.dashboard.todayReceipt.transactionCount).toBe(1);

      const backup = await source.exportVault({ recoveryKey: created.recoveryKey });
      expect(backup.byteLength).toBeGreaterThan(0);
      expect(target.getSnapshot().access).toBe('onboarding');

      await target.recoverFromVault({
        packageBytes: backup,
        recoveryKey: created.recoveryKey,
        pin: '7391058246',
      });

      let recovered = target.getSnapshot();
      expect(recovered.access).toBe('unlocked');
      expect(recovered.dashboard.nickname).toBe('복구 훈련');
      expect(recovered.dashboard.expenseMinor).toBe(3000);
      expect(recovered.dashboard.todayReceipt.transactionCount).toBe(1);

      target.lock();
      expect(target.getSnapshot().access).toBe('locked');

      await target.unlock('7391058246');
      recovered = target.getSnapshot();
      expect(recovered.access).toBe('unlocked');
      expect(recovered.dashboard.expenseMinor).toBe(3000);
      expect(recovered.dashboard.todayReceipt.transactionCount).toBe(1);
    } finally {
      source.close();
      target.close();
    }
  });

  it('requires the current PIN and fully clears a local-only Vault on reset', async () => {
    const dbName = `runtime-reset-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({
      dbName,
      argon2Profile: 'test',
      now: () => new Date('2026-10-13T09:00:00.000Z'),
    });

    try {
      await runtime.createProfile({ nickname: '초기화 테스트', pin: '4829517304' });
      await runtime.submitTransaction({ mode: 'direct', amountMinor: 7000, memo: '삭제 전 기록' });
      expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(7000);

      await expect(runtime.resetAllData({ pin: '9382716405' })).rejects.toThrow();
      expect(runtime.getSnapshot().access).toBe('unlocked');
      expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(7000);

      await runtime.resetAllData({ pin: '4829517304' });
      expect(runtime.getSnapshot().access).toBe('onboarding');
      expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(0);

      expect(await dumpStore(dbName, STORE_NAMES.records)).toEqual([]);
      expect(await dumpStore(dbName, STORE_NAMES.events)).toEqual([]);
      expect(await dumpStore(dbName, STORE_NAMES.securityMeta)).toEqual([]);
    } finally {
      runtime.close();
    }
  });

  it('refuses submissions after lock and clears hydrated financial state', async () => {
    const runtime = await BrowserRuntime.open({ dbName: `runtime-${crypto.randomUUID()}`, argon2Profile: 'test' });
    try {
      await runtime.createProfile({ nickname: '예현', pin: '4829517304' });
      await runtime.submitTransaction({ mode: 'direct', amountMinor: 13000, memo: '점심' });
      runtime.lock();

      expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(0);
      await expect(runtime.submitTransaction({ mode: 'direct', amountMinor: 1000, memo: '잠김' })).rejects.toThrow(/locked/i);
    } finally {
      runtime.close();
    }
  });
});

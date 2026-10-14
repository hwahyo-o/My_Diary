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

  it('counts only active Quick Add category coverage without presenting it as accuracy', async () => {
    const dbName = `coverage-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({
      dbName,
      argon2Profile: 'test',
      now: () => new Date('2026-10-14T01:00:00.000Z'),
    });
    try {
      await runtime.createProfile({ nickname: '분류 통계', pin: '4829517304' });
      expect(runtime.getSnapshot().analytics.classificationCoverage).toMatchObject({
        totalQuickCount: 0,
        uncategorizedQuickCount: 0,
        coveragePercent: 0,
      });
      await runtime.submitTransaction({ mode: 'quick', text: '커피 4500' });
      await runtime.submitTransaction({ mode: 'quick', text: '알수없는구매 7000' });
      await runtime.submitTransaction({ mode: 'direct', amountMinor: 3000, memo: '직접 기록' });
      expect(runtime.getSnapshot().analytics.classificationCoverage).toMatchObject({
        totalQuickCount: 2,
        categorizedQuickCount: 1,
        uncategorizedQuickCount: 1,
        coveragePercent: 50,
      });
      const unclassified = runtime.getSnapshot().calendar.transactions.find((item) => item.label.includes('알수없는구매'));
      if (!unclassified) throw new Error('Missing transaction fixture');
      await runtime.deleteTransaction(unclassified.id);
      expect(runtime.getSnapshot().analytics.classificationCoverage).toMatchObject({
        totalQuickCount: 1, categorizedQuickCount: 1, uncategorizedQuickCount: 0, coveragePercent: 100,
      });
    } finally {
      runtime.close();
    }
  });

  it('rejects multiple amounts without creating any transaction even with manual correction', async () => {
    const runtime = await BrowserRuntime.open({
      dbName: `multi-amount-${crypto.randomUUID()}`,
      argon2Profile: 'test',
      now: () => new Date('2026-10-14T01:00:00.000Z'),
    });
    try {
      await runtime.createProfile({ nickname: '복합 입력 검사', pin: '4829517304' });
      const text = '그제 점심 8000원, 오늘 커피 4500원';
      expect(runtime.previewQuickTransaction(text).multipleAmounts).toBe(true);
      await expect(runtime.submitTransaction({ mode: 'quick', text })).rejects.toThrow(/Multiple amounts/);
      await expect(runtime.submitTransaction({
        mode: 'quick',
        text,
        correction: {
          transactionType: 'expense',
          categoryId: 'food',
          fixedVariable: 'variable',
          occurredAt: '2026-10-14T12:00:00.000+09:00',
        },
      })).rejects.toThrow(/Multiple amounts/);
      expect(runtime.getSnapshot().calendar.transactions).toHaveLength(0);
      expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(0);
    } finally {
      runtime.close();
    }
  });

  it('previews and atomically saves two distinct quick entries', async () => {
    const runtime = await BrowserRuntime.open({
      dbName: `batch-${crypto.randomUUID()}`, argon2Profile: 'test',
      now: () => new Date('2026-10-14T01:00:00.000Z'),
    });
    try {
      await runtime.createProfile({ nickname: '일괄 입력', pin: '4829517304' });
      const text = '그제 점심 8000원, 오늘 커피 4500원';
      const preview = runtime.previewQuickBatch(text);
      expect(preview.valid).toBe(true);
      expect(preview.entries).toHaveLength(2);
      expect(preview.entries.map((item) => item.amountMinor)).toEqual([8000, 4500]);
      await runtime.submitTransaction({ mode: 'batch', text });
      expect(runtime.getSnapshot().calendar.transactions).toHaveLength(2);
      expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(12500);
    } finally { runtime.close(); }
  });

  it('rejects an invalid batch without partial writes', async () => {
    const runtime = await BrowserRuntime.open({
      dbName: `batch-invalid-${crypto.randomUUID()}`, argon2Profile: 'test',
      now: () => new Date('2026-10-14T01:00:00.000Z'),
    });
    try {
      await runtime.createProfile({ nickname: '검증 테스트', pin: '4829517304' });
      const text = '오늘 커피 4500원; 알수없는구매';
      expect(runtime.previewQuickBatch(text).valid).toBe(false);
      await expect(runtime.submitTransaction({ mode: 'batch', text })).rejects.toThrow();
      expect(runtime.getSnapshot().calendar.transactions).toHaveLength(0);
    } finally { runtime.close(); }
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

  it('stores fixed-variable category settings encrypted and applies them to Quick Add', async () => {
    const dbName = `runtime-classification-settings-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({
      dbName,
      argon2Profile: 'test',
      now: () => new Date('2026-10-14T01:00:00.000Z'),
    });

    try {
      await runtime.createProfile({ nickname: '규칙 테스트', pin: '4829517304' });
      expect(runtime.getSnapshot().classificationSettings?.categories.find((item) => item.id === 'food')?.mode).toBe('auto');

      await runtime.saveFixedVariableRule({ categoryId: 'food', mode: 'fixed' });
      expect(runtime.getSnapshot().classificationSettings?.categories.find((item) => item.id === 'food')?.mode).toBe('fixed');

      await runtime.submitTransaction({ mode: 'quick', text: '커피 4500' });
      expect(runtime.getSnapshot().analytics.fixedMinor).toBe(4500);
      expect(runtime.getSnapshot().analytics.variableMinor).toBe(0);

      const records = await dumpStore(dbName, STORE_NAMES.records);
      const serialized = JSON.stringify(records);
      expect(serialized).not.toContain('fixedVariableByCategory');
      expect(serialized).not.toContain('"food":"fixed"');

      await runtime.saveFixedVariableRule({ categoryId: 'food', mode: 'auto' });
      expect(runtime.getSnapshot().classificationSettings?.categories.find((item) => item.id === 'food')?.mode).toBe('auto');

      await runtime.addCategoryKeyword({ categoryId: 'food', keyword: '샌드위치' });
      expect(runtime.getSnapshot().classificationSettings?.categories.find((item) => item.id === 'food')?.keywords)
        .toEqual(expect.arrayContaining([{ value: '샌드위치', source: 'custom' }]));
      await runtime.submitTransaction({ mode: 'quick', text: '샌드위치 6500' });
      expect(runtime.getSnapshot().analytics.variableMinor).toBe(6500);

      await runtime.removeCategoryKeyword({ categoryId: 'food', keyword: '커피' });
      expect(runtime.getSnapshot().classificationSettings?.categories.find((item) => item.id === 'food')?.keywords)
        .not.toEqual(expect.arrayContaining([{ value: '커피', source: 'default' }]));

      const encryptedAfterKeywords = JSON.stringify(await dumpStore(dbName, STORE_NAMES.records));
      expect(encryptedAfterKeywords).not.toContain('샌드위치');
      expect(encryptedAfterKeywords).not.toContain('customCategoryKeywords');

      await runtime.addIncomeKeyword({ keyword: '원고료' });
      expect(runtime.getSnapshot().classificationSettings?.incomeKeywords)
        .toEqual(expect.arrayContaining([{ value: '원고료', source: 'custom' }]));
      await runtime.submitTransaction({ mode: 'quick', text: '원고료 120000' });
      expect(runtime.getSnapshot().dashboard.incomeMinor).toBe(120000);

      await runtime.removeIncomeKeyword({ keyword: '월급' });
      expect(runtime.getSnapshot().classificationSettings?.incomeKeywords)
        .not.toEqual(expect.arrayContaining([{ value: '월급', source: 'default' }]));

      const encryptedAfterIncomeKeywords = JSON.stringify(await dumpStore(dbName, STORE_NAMES.records));
      expect(encryptedAfterIncomeKeywords).not.toContain('원고료');
      expect(encryptedAfterIncomeKeywords).not.toContain('customIncomeKeywords');
    } finally {
      runtime.close();
    }
  });

  it('previews Quick Add with the exact runtime rules without mutating the ledger', async () => {
    const dbName = `runtime-quick-preview-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({
      dbName,
      argon2Profile: 'test',
      now: () => new Date('2026-10-14T01:00:00.000Z'),
    });

    try {
      await runtime.createProfile({ nickname: '미리보기 테스트', pin: '4829517304' });
      await runtime.addIncomeKeyword({ keyword: '원고료' });
      const preview = runtime.previewQuickTransaction('그제 원고료 120000');

      expect(preview).toMatchObject({
        amountMinor: 120000,
        transactionType: 'income',
        categoryId: 'uncategorized',
        categoryLabel: '미분류',
        fixedVariable: 'variable',
        needsReview: false,
        unresolvedAmount: false,
      });
      expect(preview.occurredAt).toContain('2026-10-12');
      expect(runtime.getSnapshot().dashboard.incomeMinor).toBe(0);
      expect(runtime.getSnapshot().calendar.transactions).toHaveLength(0);
    } finally {
      runtime.close();
    }
  });

  it('applies reviewed Quick Add corrections to the stored transaction', async () => {
    const dbName = `runtime-quick-correction-${crypto.randomUUID()}`;
    const runtime = await BrowserRuntime.open({
      dbName,
      argon2Profile: 'test',
      now: () => new Date('2026-10-14T01:00:00.000Z'),
    });

    try {
      await runtime.createProfile({ nickname: '수정 테스트', pin: '4829517304' });
      await runtime.submitTransaction({
        mode: 'quick',
        text: '월급 4500',
        correction: {
          transactionType: 'expense',
          categoryId: 'food',
          fixedVariable: 'fixed',
          occurredAt: '2026-10-13T12:00:00.000+09:00',
        },
      });

      const snapshot = runtime.getSnapshot();
      expect(snapshot.dashboard.incomeMinor).toBe(0);
      expect(snapshot.dashboard.expenseMinor).toBe(4500);
      expect(snapshot.analytics.fixedMinor).toBe(4500);
      expect(snapshot.calendar.transactions[0]?.occurredAt).toContain('2026-10-13');
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

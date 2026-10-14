import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
import { openVaultDatabase, STORE_NAMES } from '../../storage/database';

const PIN = '4829517304';
const OTHER_PIN = '7391058246';
const when = () => new Date('2026-10-14T01:00:00.000Z');
const options = (dbName: string) => ({ dbName, argon2Profile: 'test' as const, now: when });

async function recordsInDatabase(dbName: string): Promise<string> {
  const db = await openVaultDatabase(dbName);
  try {
    const transaction = db.transaction(STORE_NAMES.records, 'readonly');
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const request = transaction.objectStore(STORE_NAMES.records).getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    return JSON.stringify(records);
  } finally {
    db.close();
  }
}

async function correct(runtime: BrowserRuntime, keyword: string, categoryId: string) {
  const preview = runtime.previewQuickTransaction(`${keyword} 4500`);
  await runtime.submitTransaction({
    mode: 'quick',
    text: `${keyword} 4500`,
    correction: {
      transactionType: 'expense',
      categoryId,
      fixedVariable: 'variable',
      occurredAt: preview.occurredAt,
    },
  });
}

describe('Personalization suggestion encrypted round-trip', () => {
  it('persists three corrections, stays encrypted, survives lock and reopen, and only applies after explicit approval', async () => {
    const dbName = `suggestion-lock-${crypto.randomUUID()}`;
    let runtime = await BrowserRuntime.open(options(dbName));
    try {
      await runtime.createProfile({ nickname: '개인화 테스트', pin: PIN });
      expect(runtime.previewQuickTransaction('샌드위치 4500').categoryId).toBe('uncategorized');
      await correct(runtime, '샌드위치', 'food');
      await correct(runtime, '샌드위치', 'food');
      expect(runtime.getSnapshot().classificationSettings?.correctionSuggestions).toEqual([]);
      await correct(runtime, '샌드위치', 'food');

      expect(runtime.getSnapshot().classificationSettings?.correctionSuggestions).toEqual([
        { keyword: '샌드위치', categoryId: 'food', categoryLabel: '식비', count: 3 },
      ]);
      expect(runtime.previewQuickTransaction('샌드위치 4500').categoryId).toBe('uncategorized');

      const encrypted = await recordsInDatabase(dbName);
      expect(encrypted).not.toContain('샌드위치');
      expect(encrypted).not.toContain('correctionObservations');
      expect(encrypted).not.toContain('식비');

      runtime.lock();
      expect(runtime.getSnapshot().classificationSettings?.correctionSuggestions ?? []).toEqual([]);
      await expect(runtime.acceptCorrectionSuggestion({ keyword: '샌드위치', categoryId: 'food' })).rejects.toThrow();

      runtime.close();
      runtime = await BrowserRuntime.open(options(dbName));
      expect(runtime.getSnapshot().access).toBe('locked');
      await runtime.unlock(PIN);
      expect(runtime.getSnapshot().classificationSettings?.correctionSuggestions).toHaveLength(1);

      await runtime.acceptCorrectionSuggestion({ keyword: '샌드위치', categoryId: 'food' });
      expect(runtime.getSnapshot().classificationSettings?.correctionSuggestions).toEqual([]);
      expect(runtime.previewQuickTransaction('샌드위치 4500').categoryId).toBe('food');
      await expect(runtime.acceptCorrectionSuggestion({ keyword: '샌드위치', categoryId: 'food' })).rejects.toThrow();

      runtime.lock();
      await runtime.unlock(PIN);
      expect(runtime.previewQuickTransaction('샌드위치 4500').categoryId).toBe('food');
    } finally {
      runtime.close();
    }
  });

  it('allows rejecting a suggestion without changing automatic classification and preserves rejection through backup and restore', async () => {
    const sourceDb = `suggestion-source-${crypto.randomUUID()}`;
    const targetDb = `suggestion-target-${crypto.randomUUID()}`;
    const source = await BrowserRuntime.open(options(sourceDb));
    const target = await BrowserRuntime.open(options(targetDb));
    try {
      const { recoveryKey } = await source.createProfile({ nickname: '복구 테스트', pin: PIN });
      for (let count = 0; count < 3; count += 1) await correct(source, '샌드위치', 'food');
      expect(source.getSnapshot().classificationSettings?.correctionSuggestions).toHaveLength(1);
      await source.dismissCorrectionSuggestion({ keyword: '샌드위치', categoryId: 'food' });
      expect(source.getSnapshot().classificationSettings?.correctionSuggestions).toEqual([]);
      expect(source.previewQuickTransaction('샌드위치 4500').categoryId).toBe('uncategorized');

      const backup = await source.exportVault({ recoveryKey });
      const serialized = new TextDecoder().decode(backup);
      expect(serialized).not.toContain('샌드위치');
      expect(serialized).not.toContain('correctionObservations');
      await target.recoverFromVault({ packageBytes: backup, recoveryKey, pin: OTHER_PIN });
      expect(target.getSnapshot().classificationSettings?.correctionSuggestions).toEqual([]);
      expect(target.previewQuickTransaction('샌드위치 4500').categoryId).toBe('uncategorized');

      for (let count = 0; count < 3; count += 1) await correct(target, '샌드위치', 'food');
      expect(target.getSnapshot().classificationSettings?.correctionSuggestions).toHaveLength(1);
    } finally {
      source.close();
      target.close();
    }
  });
});

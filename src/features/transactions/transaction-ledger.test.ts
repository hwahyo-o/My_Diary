import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { parseISODateTime, parseUUID } from '../../domain/shared/types';
import type { Transaction } from '../../domain/transactions/types';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository } from '../../storage/repository';
import { VaultSession } from '../../vault/session';
import { resolveCategory } from './category-resolver';
import { detectDuplicateRisk } from './duplicate-detector';
import { parseQuickInput, quickCandidateToDraft } from './quick-parser';
import { TransactionLedgerService } from './transaction-service';
import { createDirectDraft, validateTransactionDraft } from './validation';

const accountId = parseUUID('11111111-1111-4111-8111-111111111111');
const otherAccountId = parseUUID('22222222-2222-4222-8222-222222222222');
const transactionId = parseUUID('33333333-3333-4333-8333-333333333333');
const deviceId = parseUUID('44444444-4444-4444-8444-444444444444');
const eventIds = [
  parseUUID('55555555-5555-4555-8555-555555555551'),
  parseUUID('55555555-5555-4555-8555-555555555552'),
  parseUUID('55555555-5555-4555-8555-555555555553'),
  parseUUID('55555555-5555-4555-8555-555555555554'),
];
const occurredAt = parseISODateTime('2026-10-02T12:00:00+09:00');
const now = parseISODateTime('2026-10-02T13:00:00+09:00');

function existingTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: transactionId,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    version: 1,
    type: 'expense',
    accountId,
    amountMinor: 13000,
    occurredAt,
    merchant: '카페 봄',
    memo: '점심',
    source: 'manual',
    fixedVariable: 'variable',
    ...overrides,
  };
}

describe('T16 direct transaction draft', () => {
  it('rejects invalid money and transfers without a distinct counter account', () => {
    expect(() => validateTransactionDraft({
      type: 'expense', accountId, amountMinor: 0, occurredAt, source: 'manual',
    })).toThrow(/amount/i);

    expect(() => validateTransactionDraft({
      type: 'transfer', accountId, counterAccountId: accountId, amountMinor: 10000, occurredAt, source: 'manual',
    })).toThrow(/counter/i);
  });

  it('creates a canonical manual draft', () => {
    const draft = createDirectDraft({
      type: 'expense', accountId, amountMinor: 13000, occurredAt, merchant: '카페 봄', memo: '점심',
    });
    expect(draft.source).toBe('manual');
    expect(draft.fixedVariable).toBe('variable');
    expect(draft.amountMinor).toBe(13000);
  });
});

describe('T17 category resolver', () => {
  const rules = [
    { kind: 'keyword' as const, match: '점심', categoryId: 'food-general' },
    { kind: 'merchant' as const, match: '카페 봄', categoryId: 'cafe' },
    { kind: 'recurring' as const, match: 'lunch-plan', categoryId: 'meal-plan' },
    { kind: 'user' as const, match: '카페 봄', categoryId: 'my-cafe-rule' },
  ];

  it('uses user > recurring > merchant > keyword priority', () => {
    expect(resolveCategory({ merchant: '카페 봄', memo: '점심', recurringKey: 'lunch-plan' }, rules)).toMatchObject({
      categoryId: 'my-cafe-rule', source: 'user', confidence: 'high',
    });

    expect(resolveCategory({ merchant: '다른 곳', memo: '점심', recurringKey: 'lunch-plan' }, rules)).toMatchObject({
      categoryId: 'meal-plan', source: 'recurring',
    });
  });

  it('returns an explicit low-confidence fallback instead of silently categorizing', () => {
    expect(resolveCategory({ merchant: '알 수 없음' }, rules)).toEqual({
      categoryId: 'uncategorized', source: 'fallback', confidence: 'low',
    });
  });
});

describe('T18 duplicate detector', () => {
  it('marks an exact nearby match high-risk without mutating candidates', () => {
    const candidates = [existingTransaction()];
    const before = JSON.stringify(candidates);
    const result = detectDuplicateRisk({
      type: 'expense', accountId, amountMinor: 13000, occurredAt, merchant: '카페 봄', source: 'manual', fixedVariable: 'variable',
    }, candidates);

    expect(result.risk).toBe('high');
    expect(result.matches).toHaveLength(1);
    expect(JSON.stringify(candidates)).toBe(before);
  });

  it('marks amount/account/type match without merchant as medium risk', () => {
    const result = detectDuplicateRisk({
      type: 'expense', accountId, amountMinor: 13000, occurredAt, source: 'manual', fixedVariable: 'variable',
    }, [existingTransaction({ merchant: '다른 곳' })]);
    expect(result.risk).toBe('medium');
  });
});

describe('T20 quick input parser', () => {
  it('parses Korean amount words and category hints without auto-saving', () => {
    const parsed = parseQuickInput('점심 만삼천', now);
    expect(parsed.amountMinor).toBe(13000);
    expect(parsed.categoryHint).toBe('food');
    expect(parsed.unresolved).toEqual([]);
  });

  it('parses yesterday and transport hints', () => {
    const parsed = parseQuickInput('어제 택시 18000', now);
    expect(parsed.amountMinor).toBe(18000);
    expect(parsed.categoryHint).toBe('transport');
    expect(parsed.occurredAt.startsWith('2026-10-01')).toBe(true);
  });

  it('keeps missing amount unresolved', () => {
    const parsed = parseQuickInput('오늘 점심', now);
    expect(parsed.unresolved).toContain('amount');
    expect(() => quickCandidateToDraft(parsed, { accountId, type: 'expense' })).toThrow(/amount/i);
  });
});

describe('T19/T21 encrypted common save path', () => {
  it('saves, blocks high-risk duplicates until confirmed, then delete/restore/undo append events without plaintext storage', async () => {
    const dbName = `ledger-${crypto.randomUUID()}`;
    const db = await openVaultDatabase(dbName);
    const repo = new EncryptedRepository(db);
    const rawKey = new Uint8Array(32).fill(42);
    const session = await VaultSession.unlock(rawKey);
    let eventIndex = 0;
    let clockIndex = 0;
    const clock = [
      parseISODateTime('2026-10-02T13:00:00+09:00'),
      parseISODateTime('2026-10-02T13:01:00+09:00'),
      parseISODateTime('2026-10-02T13:02:00+09:00'),
      parseISODateTime('2026-10-02T13:03:00+09:00'),
    ];
    const service = new TransactionLedgerService({
      repository: repo,
      session,
      vaultId: 'vault-1',
      schemaVersion: 1,
      deviceId,
      newTransactionId: () => transactionId,
      newEventId: () => eventIds[eventIndex++]!,
      now: () => clock[clockIndex++]!,
    });

    try {
      const draft = createDirectDraft({
        type: 'expense', accountId, amountMinor: 13000, occurredAt, merchant: '카페 봄', memo: '비밀 점심',
      });

      await expect(service.saveDraft(draft, {
        expectedRevision: 0,
        duplicateCandidates: [existingTransaction()],
      })).rejects.toThrow(/duplicate/i);

      const saved = await service.saveDraft(draft, {
        expectedRevision: 0,
        duplicateCandidates: [existingTransaction()],
        confirmDuplicate: true,
      });
      expect(saved.transaction.source).toBe('manual');
      expect(saved.revision).toBe(1);

      const rawStored = await repo.getRecord(transactionId);
      const rawEvent = await repo.getEvent(eventIds[0]!);
      const storedText = new TextDecoder().decode(rawStored?.encryptedPayload);
      const eventText = new TextDecoder().decode(rawEvent?.encryptedPatch);
      expect(storedText).not.toContain('카페 봄');
      expect(storedText).not.toContain('비밀 점심');
      expect(eventText).not.toContain('비밀 점심');

      const deleted = await service.deleteTransaction(transactionId, 1);
      expect(deleted.transaction.deletedAt).toBeDefined();
      expect(deleted.transaction.version).toBe(2);
      expect(deleted.revision).toBe(2);

      const restored = await service.restoreTransaction(transactionId, 2);
      expect(restored.transaction.deletedAt).toBeUndefined();
      expect(restored.transaction.version).toBe(3);
      expect(restored.revision).toBe(3);

      const undone = await service.undoLastMutation(transactionId, 3);
      expect(undone.transaction.deletedAt).toBeDefined();
      expect(undone.transaction.version).toBe(4);
      expect(undone.revision).toBe(4);

      const events = await repo.listEventsByRecord(transactionId);
      expect(events.map((item) => item.action)).toEqual(['create', 'delete', 'restore', 'update']);
    } finally {
      session.lock();
      db.close();
    }
  });

  it('converges Quick and Direct input on equivalent accounting fields while preserving source', () => {
    const direct = createDirectDraft({ type: 'expense', accountId, amountMinor: 13000, occurredAt, merchant: '점심' });
    const quick = quickCandidateToDraft(parseQuickInput('점심 만삼천', occurredAt), { accountId, type: 'expense' });

    expect(quick.source).toBe('quick');
    expect(direct.source).toBe('manual');
    expect(quick.type).toBe(direct.type);
    expect(quick.accountId).toBe(direct.accountId);
    expect(quick.amountMinor).toBe(direct.amountMinor);
  });
});

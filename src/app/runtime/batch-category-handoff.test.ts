import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';
import { TransactionLedgerService } from '../../features/transactions/transaction-service';

it('passes reviewed categories and expense flags to the actual batch persistence service', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `batch-category-handoff-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-15T05:00:00.000Z'),
  });
  const original = TransactionLedgerService.prototype.saveDraftBatch;
  const persisted = vi.spyOn(TransactionLedgerService.prototype, 'saveDraftBatch')
    .mockImplementation(function (drafts, expectedRevision) {
      expect(drafts).toHaveLength(2);
      expect(drafts[0]).toMatchObject({
        categoryId: 'transport', fixedVariable: 'fixed', amountMinor: 9500, type: 'expense',
      });
      expect(drafts[1]).toMatchObject({
        categoryId: 'uncategorized', fixedVariable: 'variable', amountMinor: 6000, type: 'income',
      });
      return original.call(this, drafts, expectedRevision);
    });
  try {
    await runtime.createProfile({ nickname: '검증용', pin: '4829517304' });
    const text = '점심 8000원; 커피 4500원';
    const entries = [
      { text: '점심 8000원', amountMinor: 9500, transactionType: 'expense' as const,
        categoryId: 'transport', fixedVariable: 'fixed' as const, occurredAt: '2026-10-12T12:00:00.000+09:00' },
      { text: '커피 4500원', amountMinor: 6000, transactionType: 'income' as const,
        categoryId: 'uncategorized', fixedVariable: 'variable' as const, occurredAt: '2026-10-13T14:00:00.000+09:00' },
    ];
    await runtime.submitTransaction({ mode: 'batch', text, entries });
    expect(persisted).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().calendar.transactions).toHaveLength(2);
    expect(runtime.getSnapshot().dashboard.expenseMinor).toBe(9500);
    expect(runtime.getSnapshot().dashboard.incomeMinor).toBe(6000);
  } finally {
    persisted.mockRestore();
    runtime.close();
  }
});

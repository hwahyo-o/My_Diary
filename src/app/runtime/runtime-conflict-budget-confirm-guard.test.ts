import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

it('keeps candidate history unchanged when cloud conflict blocks a budget selection', async () => {
  const runtime = await BrowserRuntime.open({
    dbName: `runtime-conflict-blocked-confirm-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-20T04:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '충돌 선택 보호 검증', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 100000 });
    await runtime.saveBudget({ limitMinor: 200000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    Object.defineProperty(runtime, 'cloudConflict', { value: true, configurable: true });
    await expect(runtime.confirmBudgetCandidate(before[1]!.id, before[0]!.id))
      .rejects.toThrow('Cloud conflict must be resolved');
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(200000);
  } finally {
    runtime.close();
  }
});

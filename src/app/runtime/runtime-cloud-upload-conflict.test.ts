import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

afterEach(() => vi.unstubAllGlobals());

it('preserves a real BrowserRuntime local budget when mocked cloud enrollment upload conflicts', async () => {
  const requests: string[] = [];
  const response = (body: object, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    requests.push(`${init?.method ?? 'GET'} ${input}`);
    if (input === '/api/account/register') {
      return response({ accountId: 'test-account', unlockPepper: 'AQIDBAUGBwgJCgsMDQ4PEA', revision: 0 });
    }
    if (input === '/api/sync/upload') return response({ error: 'Cloud revision conflict' }, 409);
    throw new Error(`Unexpected mock cloud request: ${input}`);
  }));
  const runtime = await BrowserRuntime.open({
    dbName: `runtime-cloud-upload-conflict-${crypto.randomUUID()}`,
    argon2Profile: 'test',
    now: () => new Date('2026-10-20T03:00:00.000Z'),
  });
  try {
    await runtime.createProfile({ nickname: '테스트예산', pin: '4829517304' });
    await runtime.saveBudget({ limitMinor: 123000 });
    const before = await runtime.listCurrentMonthBudgetCandidates();
    await expect(runtime.enrollCloud({ pin: '4829517304' })).rejects.toThrow('Cloud revision conflict');
    expect(requests).toContain('POST /api/account/register');
    expect(requests).toContain('PUT /api/sync/upload');
    expect(await runtime.listCurrentMonthBudgetCandidates()).toEqual(before);
    expect(runtime.getSnapshot().dashboard.budget.limitMinor).toBe(123000);
  } finally {
    runtime.close();
  }
});

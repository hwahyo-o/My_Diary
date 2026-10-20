import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserRuntime } from './browser-runtime';

afterEach(() => vi.unstubAllGlobals());

it('preserves divergent same-month budget histories across two runtimes and mocked cloud synchronization', async () => {
  const nickname = '두기기테스트';
  const pin = '4829517304';
  const pepper = 'AQIDBAUGBwgJCgsMDQ4PEA';
  let accountSalt = '';
  let revision = 0;
  let bytes: Uint8Array | null = null;
  let digest = '';
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/account/register') {
      const body = JSON.parse(String(init?.body)) as { accountSalt: string };
      accountSalt = body.accountSalt ?? '';
      return json({ accountId: 'integration-account', unlockPepper: pepper, revision: 0 });
    }
    if (url === '/api/account/challenge') return json({ accountSalt });
    if (url === '/api/account/login') return json({ accountId: 'integration-account', unlockPepper: pepper, revision });
    if (url === '/api/sync/head') return json({ revision, objectSha256: digest || null, updatedAt: null });
    if (url === '/api/sync/upload') {
      const headers = init?.headers as Record<string, string>;
      if (Number(headers['x-my-diary-expected-revision']) !== revision) return json({ error: 'Revision conflict' }, 409);
      bytes = new Uint8Array(init?.body as ArrayBuffer);
      digest = headers['x-my-diary-sha256'] ?? '';
      revision += 1;
      return json({ revision });
    }
    if (url === '/api/sync/download') {
      if (bytes === null) return new Response(null, { status: 204 });
      return new Response(bytes.slice(), { status: 200, headers: {
        'x-my-diary-revision': String(revision), 'x-my-diary-sha256': digest,
      } });
    }
    throw new Error(`Unmocked endpoint: ${url}`);
  }));
  const now = () => new Date('2026-10-20T03:00:00.000Z');
  const first = await BrowserRuntime.open({ dbName: `sync-a-${crypto.randomUUID()}`, argon2Profile: 'test', now });
  const second = await BrowserRuntime.open({ dbName: `sync-b-${crypto.randomUUID()}`, argon2Profile: 'test', now });
  try {
    await first.createProfile({ nickname, pin });
    await first.saveBudget({ limitMinor: 170000 });
    await first.enrollCloud({ pin });
    expect(revision).toBeGreaterThan(0);
    await second.loginFromCloud({ nickname, pin });
    expect(second.getSnapshot().dashboard.budget.limitMinor).toBe(170000);
    expect((await second.listCurrentMonthBudgetCandidates()).map((item) => item.limitMinor)).toContain(170000);
    // Both devices independently append budget history. Uploads may race;
    // neither runtime may silently delete its own local candidate.
    await Promise.all([
      first.saveBudget({ limitMinor: 210000 }),
      second.saveBudget({ limitMinor: 260000 }),
    ]);
    expect((await first.listCurrentMonthBudgetCandidates()).map((item) => item.limitMinor)).toContain(210000);
    expect((await second.listCurrentMonthBudgetCandidates()).map((item) => item.limitMinor)).toContain(260000);
    await Promise.all([first.syncCloudBestEffort(), second.syncCloudBestEffort()]);
    const allA = (await first.listCurrentMonthBudgetCandidates()).map((item) => item.limitMinor);
    const allB = (await second.listCurrentMonthBudgetCandidates()).map((item) => item.limitMinor);
    expect(allA).toContain(170000);
    expect(allB).toContain(170000);
    expect(allA).toContain(210000);
    expect(allB).toContain(260000);
  } finally {
    first.close();
    second.close();
  }
});

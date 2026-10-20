import { afterEach, expect, it, vi } from 'vitest';
import { CloudSyncClient, CloudSyncHttpError } from '../../cloud-sync/http-client';

afterEach(() => vi.unstubAllGlobals());

it('accepts only one competing device upload at a shared cloud revision', async () => {
  let revision = 4;
  let storedBytes = new Uint8Array([9]);
  const uploads: Array<{ expected: number; status: number }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/sync/head') {
      return new Response(JSON.stringify({ revision }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url !== '/api/sync/upload') throw new Error('Unexpected cloud route');
    const headers = options?.headers as Record<string, string>;
    const expected = Number(headers['x-my-diary-expected-revision']);
    if (expected !== revision) {
      uploads.push({ expected, status: 409 });
      return new Response(JSON.stringify({ error: 'Cloud revision conflict' }), {
        status: 409, headers: { 'content-type': 'application/json' },
      });
    }
    storedBytes = new Uint8Array(options!.body as ArrayBuffer);
    revision++;
    uploads.push({ expected, status: 200 });
    return new Response(JSON.stringify({ revision }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }));
  const a = new CloudSyncClient();
  const b = new CloudSyncClient();
  const [headA, headB] = await Promise.all([a.getHead(), b.getHead()]);
  expect(headA.revision).toBe(4);
  expect(headB.revision).toBe(4);
  await a.uploadSnapshot({ expectedRevision: headA.revision, objectSha256: 'synthetic-a', bytes: new Uint8Array([1]) });
  await expect(b.uploadSnapshot({
    expectedRevision: headB.revision, objectSha256: 'synthetic-b', bytes: new Uint8Array([2]),
  })).rejects.toBeInstanceOf(CloudSyncHttpError);
  expect(uploads).toEqual([{ expected: 4, status: 200 }, { expected: 4, status: 409 }]);
  expect(revision).toBe(5);
  expect(Array.from(storedBytes)).toEqual([1]);
});

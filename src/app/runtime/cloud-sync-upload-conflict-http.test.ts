import { afterEach, expect, it, vi } from 'vitest';
import { CloudSyncClient, CloudSyncHttpError } from '../../cloud-sync/http-client';

afterEach(() => vi.unstubAllGlobals());

it('does not retry or silently overwrite on an HTTP 409 cloud snapshot upload', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Cloud snapshot revision conflict' }), {
    status: 409, headers: { 'content-type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fetchMock);
  const client = new CloudSyncClient('');
  await expect(client.uploadSnapshot({
    expectedRevision: 4,
    objectSha256: 'test-sha256-not-for-production',
    bytes: new Uint8Array([1, 2, 3]),
  })).rejects.toMatchObject({ status: 409, name: 'CloudSyncHttpError' } satisfies Partial<CloudSyncHttpError>);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/sync/upload');
  expect(request.headers).toMatchObject({ 'x-my-diary-expected-revision': '4' });
});

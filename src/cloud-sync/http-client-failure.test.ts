import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudSyncClient } from './http-client';

const client = new CloudSyncClient();
const payload = new Uint8Array([1, 2, 3, 4]);
const upload = { expectedRevision: 4, objectSha256: 'valid-digest', bytes: payload };

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('cloud HTTP failure and retry boundaries', () => {
  it('does not silently succeed on offline network rejection, and a later retry uses the same encrypted bytes', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: 5 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.uploadSnapshot(upload)).rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const result = await client.uploadSnapshot(upload);
    expect(result.revision).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    for (const [url, init] of calls) {
      expect(url).toBe('/api/sync/upload');
      expect(init.method).toBe('PUT');
      expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(payload);
      expect((init.headers as Record<string, string>)['x-my-diary-expected-revision']).toBe('4');
    }
    expect(payload).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it.each([401, 409, 429, 500, 503])('rejects upload HTTP %i rather than acknowledging an uncommitted snapshot', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'sync failed' }), { status }),
    ));
    await expect(client.uploadSnapshot(upload)).rejects.toThrow('sync failed');
  });

  it('rejects a failed cloud head check and allows later head recovery', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: 4 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.getHead()).rejects.toThrow('offline');
    await expect(client.getHead()).resolves.toEqual({ revision: 4 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not accept malformed successful snapshot download metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(payload, { status: 200 })));
    await expect(client.downloadSnapshot()).rejects.toThrow('Cloud snapshot metadata is invalid.');
  });
});

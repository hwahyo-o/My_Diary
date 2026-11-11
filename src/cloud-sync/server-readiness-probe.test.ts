import { describe, expect, it } from 'vitest';
// @ts-expect-error Cloudflare Pages JavaScript functions have no TS declarations.
import { onRequestGet } from '../../functions/api/sync/health.js';

const secret = (value: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(value)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const validEnv = (names = ['accounts', 'sessions', 'sync_heads', 'devices']) => ({
  AUTH_PEPPER: secret(1),
  UNLOCK_MASTER_KEY: secret(2),
  VAULT_BUCKET: { get() {}, put() {}, delete() {} },
  DB: {
    prepare(query: string) {
      if (!query.includes('sqlite_master')) throw new Error('Unexpected query');
      return {
        all: async () => ({ results: names.map(name => ({ name })) }),
      };
    },
  },
});

describe('cloud sync readiness probe', () => {
  it('returns 503 without required bindings or secrets, without exposing details', async () => {
    const response = await onRequestGet({ env: {} });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });

  it('returns 503 if the Preview schema is not yet installed', async () => {
    const response = await onRequestGet({ env: validEnv(['accounts']) });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });

  it('returns 503 and no account metadata if the database is unavailable', async () => {
    const env = validEnv();
    env.DB.prepare = () => { throw new Error('private database error'); };
    const response = await onRequestGet({ env });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });

  it('returns a minimal ready response after checking schema and resource bindings', async () => {
    const response = await onRequestGet({ env: validEnv() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('rejects malformed secrets without leaking them', async () => {
    const env = { ...validEnv(), AUTH_PEPPER: 'invalid-super-secret' };
    const response = await onRequestGet({ env });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(env.AUTH_PEPPER);
  });
});

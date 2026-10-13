// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { verifyLiveProduction, verifyProductionHeaders } from './verify-live-production.mjs';

const SHA = '5ca1610587b9db238553d41016d14f38991a53dd';

function secureHeaders() {
  return new Headers({
    'content-security-policy':
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'strict-transport-security': 'max-age=31536000',
    'x-permitted-cross-domain-policies': 'none',
  });
}

function response(body, { headers = {}, status = 200 } = {}) {
  return new Response(body, { status, headers });
}

const read = vi.fn(async (path) => {
  if (path === 'package.json') return JSON.stringify({ version: '0.1.1' });
  if (path === 'public/sw.js') {
    return "const RELEASE_ID = '2026.10.12.2';\nif (event.origin !== self.location.origin) return;";
  }
  throw new Error(`unexpected read: ${path}`);
});

describe('live production verifier', () => {
  it('accepts the exact live release identity and hardened headers', async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/release-manifest.json')) {
        return response(
          JSON.stringify({
            format: 'my-diary-release-manifest',
            version: 1,
            commitSha: SHA,
            appVersion: '0.1.1',
            vaultSchemaVersion: 1,
            serviceWorkerReleaseId: '2026.10.12.2',
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/sw.js')) {
        return response(
          "const RELEASE_ID = '2026.10.12.2';\nif (event.origin !== self.location.origin) return;",
        );
      }
      return response('<title>My Diary</title>', { headers: secureHeaders() });
    });

    await expect(
      verifyLiveProduction({
        expectedSha: SHA,
        siteUrl: 'https://my-diary.example/',
        fetchImpl,
        read,
      }),
    ).resolves.toMatchObject({
      commitSha: SHA,
      appVersion: '0.1.1',
      vaultSchemaVersion: 1,
      serviceWorkerReleaseId: '2026.10.12.2',
      attempt: 1,
    });
  });

  it('rejects weakened production headers', () => {
    const headers = secureHeaders();
    headers.delete('x-frame-options');
    expect(() => verifyProductionHeaders(headers)).toThrow(/x-frame-options/i);

    const unsafe = secureHeaders();
    unsafe.set(
      'content-security-policy',
      "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    expect(() => verifyProductionHeaders(unsafe)).toThrow(/unsafe-eval/i);
  });

  it('retries when Cloudflare has not propagated the expected main SHA yet', async () => {
    let manifestCalls = 0;
    const fetchImpl = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/release-manifest.json')) {
        manifestCalls += 1;
        return response(
          JSON.stringify({
            format: 'my-diary-release-manifest',
            version: 1,
            commitSha: manifestCalls === 1 ? 'a'.repeat(40) : SHA,
            appVersion: '0.1.1',
            vaultSchemaVersion: 1,
            serviceWorkerReleaseId: '2026.10.12.2',
          }),
        );
      }
      if (url.endsWith('/sw.js')) {
        return response(
          "const RELEASE_ID = '2026.10.12.2';\nif (event.origin !== self.location.origin) return;",
        );
      }
      return response('<title>My Diary</title>', { headers: secureHeaders() });
    });

    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await verifyLiveProduction({
      expectedSha: SHA,
      siteUrl: 'https://my-diary.example/',
      attempts: 2,
      retryDelayMs: 1,
      fetchImpl,
      read,
      sleep,
    });

    expect(result.attempt).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

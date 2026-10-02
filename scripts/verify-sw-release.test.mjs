// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { verifyServiceWorkerRelease } from './verify-sw-release.mjs';

const safeWorker = `
const RELEASE_ID = '2026.10.02.1';
const CACHE_PREFIX = 'my-diary-shell-';
const CACHE_NAME = \`${'${CACHE_PREFIX}'}${'${RELEASE_ID}'}\`;
const SENSITIVE_PATH_PREFIXES = ['/api/', '/runtime/', '/finance/', '/vault/', '/backup/', '/import/', '/export/'];
function classifyRequest(request) {
  if (request.method !== 'GET') return 'bypass';
  const url = new URL(request.url);
  if (url.pathname.toLowerCase().endsWith('.vault')) return 'bypass';
  if (SENSITIVE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return 'bypass';
  return 'static';
}
`;

describe('service worker release verifier', () => {
  it('accepts an explicit release token with all sensitive bypass guards', () => {
    expect(verifyServiceWorkerRelease(safeWorker)).toEqual({ releaseId: '2026.10.02.1' });
  });

  it('rejects a generic cache version or missing sensitive bypass guard', () => {
    expect(() => verifyServiceWorkerRelease(safeWorker.replace("const RELEASE_ID = '2026.10.02.1';", "const RELEASE_ID = 'v1';"))).toThrow(/release/i);
    expect(() => verifyServiceWorkerRelease(safeWorker.replace("'/backup/',", ''))).toThrow(/backup/i);
    expect(() => verifyServiceWorkerRelease(safeWorker.replace("endsWith('.vault')", "endsWith('.bak')"))).toThrow(/\.vault/i);
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyDistSecurity } from './verify-dist-security.mjs';

const roots = [];

const safeHeaders = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
`;

async function makeDist({ html, js = "console.log('safe')", headers = safeHeaders, extraFiles = [] }) {
  const root = await mkdtemp(join(tmpdir(), 'my-diary-dist-'));
  roots.push(root);
  const dist = join(root, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), html, 'utf8');
  await writeFile(join(dist, 'assets', 'app.js'), js, 'utf8');
  await writeFile(join(dist, '_headers'), headers, 'utf8');
  for (const [name, content] of extraFiles) {
    await writeFile(join(dist, name), content, 'utf8');
  }
  return dist;
}

const safeCsp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'";

function htmlWithCsp(csp = safeCsp) {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body><script type="module" src="/assets/app.js"></script></body></html>`;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('production artifact security verifier', () => {
  it('accepts a local-only dist with the required CSP fallback', async () => {
    const dist = await makeDist({ html: htmlWithCsp() });
    await expect(verifyDistSecurity(dist)).resolves.toMatchObject({ filesScanned: 2 });
  });

  it('rejects source maps, external executable/font origins, and secret-like material', async () => {
    const distWithMap = await makeDist({ html: htmlWithCsp(), extraFiles: [['app.js.map', '{}']] });
    await expect(verifyDistSecurity(distWithMap)).rejects.toThrow(/source map/i);

    const distWithExternal = await makeDist({
      html: htmlWithCsp(),
      js: "fetch('https://tracker.example/collect')",
    });
    await expect(verifyDistSecurity(distWithExternal)).rejects.toThrow(/external origin/i);

    const distWithSecret = await makeDist({
      html: htmlWithCsp(),
      js: 'const RECOVERY_KEY_SAMPLE = "RECOVERY-THIS-MUST-NOT-SHIP";',
    });
    await expect(verifyDistSecurity(distWithSecret)).rejects.toThrow(/secret-like/i);
  });

  it('rejects a missing required Cloudflare response header', async () => {
    const dist = await makeDist({
      html: htmlWithCsp(),
      headers: safeHeaders.replace("X-Frame-Options: DENY\n", ''),
    });
    await expect(verifyDistSecurity(dist)).rejects.toThrow(/response headers/i);
  });

  it('rejects a missing or weakened CSP fallback', async () => {
    const missing = await makeDist({ html: '<!doctype html><html><body></body></html>' });
    await expect(verifyDistSecurity(missing)).rejects.toThrow(/content-security-policy/i);

    const weakened = await makeDist({ html: htmlWithCsp("default-src *; script-src * 'unsafe-eval'") });
    await expect(verifyDistSecurity(weakened)).rejects.toThrow(/csp/i);
  });
});

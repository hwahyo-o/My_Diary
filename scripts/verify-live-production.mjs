/* global process, console, fetch, URL, setTimeout */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_SITE_URL = 'https://my-diary-2mw.pages.dev/';

function requiredHeader(headers, name) {
  const value = headers.get(name);
  if (!value) throw new Error(`Missing required response header: ${name}`);
  return value;
}

export function verifyProductionHeaders(headers) {
  const csp = requiredHeader(headers, 'content-security-policy');
  const requiredCspFragments = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ];
  for (const fragment of requiredCspFragments) {
    if (!csp.includes(fragment)) throw new Error(`Production CSP is missing: ${fragment}`);
  }
  if (/script-src[^;]*'unsafe-eval'/i.test(csp)) {
    throw new Error("Production CSP must not allow JavaScript 'unsafe-eval'.");
  }
  if (/script-src[^;]*'unsafe-inline'/i.test(csp)) {
    throw new Error("Production CSP must not allow script 'unsafe-inline'.");
  }

  const exact = new Map([
    ['x-frame-options', 'DENY'],
    ['x-content-type-options', 'nosniff'],
    ['referrer-policy', 'no-referrer'],
    ['cross-origin-opener-policy', 'same-origin'],
    ['cross-origin-resource-policy', 'same-origin'],
    ['x-permitted-cross-domain-policies', 'none'],
  ]);
  for (const [name, expected] of exact) {
    const actual = requiredHeader(headers, name);
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(`Unexpected ${name}: expected ${expected}, found ${actual}`);
    }
  }

  const permissions = requiredHeader(headers, 'permissions-policy');
  for (const directive of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()', 'usb=()']) {
    if (!permissions.includes(directive)) {
      throw new Error(`Permissions-Policy is missing: ${directive}`);
    }
  }

  const hsts = requiredHeader(headers, 'strict-transport-security');
  if (!/max-age=\d+/i.test(hsts)) {
    throw new Error('Strict-Transport-Security must include max-age.');
  }

  return true;
}

function parseReleaseId(source) {
  const match = source.match(/const\s+RELEASE_ID\s*=\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error('Unable to read local Service Worker release ID.');
  return match[1];
}

async function readExpectedRelease(read = readFile) {
  const packageJson = JSON.parse(await read('package.json', 'utf8'));
  const swSource = await read('public/sw.js', 'utf8');
  return {
    appVersion: packageJson.version,
    serviceWorkerReleaseId: parseReleaseId(swSource),
  };
}

function normalizeSiteUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Production verification requires HTTPS.');
  url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  url.search = '';
  url.hash = '';
  return url;
}

async function fetchRequired(fetchImpl, url) {
  const response = await fetchImpl(url, {
    cache: 'no-store',
    redirect: 'follow',
    headers: { 'cache-control': 'no-cache' },
  });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: HTTP ${response.status}`);
  }
  return response;
}

export async function verifyLiveProduction({
  siteUrl = process.env.PRODUCTION_URL || DEFAULT_SITE_URL,
  expectedSha = process.env.EXPECTED_SHA,
  attempts = Number(process.env.MAX_ATTEMPTS || 1),
  retryDelayMs = Number(process.env.RETRY_DELAY_MS || 0),
  fetchImpl = fetch,
  read = readFile,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (!expectedSha || !/^[0-9a-f]{40}$/i.test(expectedSha)) {
    throw new Error('EXPECTED_SHA must be a full 40-character commit SHA.');
  }
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 40) {
    throw new Error('MAX_ATTEMPTS must be an integer between 1 and 40.');
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 60000) {
    throw new Error('RETRY_DELAY_MS must be between 0 and 60000.');
  }

  const base = normalizeSiteUrl(siteUrl);
  const expected = await readExpectedRelease(read);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const root = await fetchRequired(fetchImpl, base);
      verifyProductionHeaders(root.headers);
      const html = await root.text();
      if (!html.includes('<title>My Diary</title>')) {
        throw new Error('Production HTML title check failed.');
      }

      const manifestResponse = await fetchRequired(fetchImpl, new URL('release-manifest.json', base));
      const manifest = await manifestResponse.json();
      if (manifest.format !== 'my-diary-release-manifest' || manifest.version !== 1) {
        throw new Error('Unexpected release manifest format.');
      }
      if (manifest.commitSha !== expectedSha) {
        throw new Error(`Production SHA mismatch: expected ${expectedSha}, found ${manifest.commitSha}`);
      }
      if (manifest.appVersion !== expected.appVersion) {
        throw new Error(`Production app version mismatch: expected ${expected.appVersion}, found ${manifest.appVersion}`);
      }
      if (manifest.serviceWorkerReleaseId !== expected.serviceWorkerReleaseId) {
        throw new Error(
          `Production Service Worker release mismatch: expected ${expected.serviceWorkerReleaseId}, found ${manifest.serviceWorkerReleaseId}`,
        );
      }
      if (manifest.vaultSchemaVersion !== 1) {
        throw new Error(`Unexpected production Vault schema: ${manifest.vaultSchemaVersion}`);
      }

      const swResponse = await fetchRequired(fetchImpl, new URL('sw.js', base));
      const sw = await swResponse.text();
      if (!sw.includes(`const RELEASE_ID = '${expected.serviceWorkerReleaseId}'`)) {
        throw new Error('Live Service Worker release token does not match the repository.');
      }
      if (!/event\.origin\s*!==\s*self\.location\.origin/.test(sw)) {
        throw new Error('Live Service Worker is missing postMessage origin validation.');
      }

      return {
        siteUrl: base.href,
        commitSha: manifest.commitSha,
        appVersion: manifest.appVersion,
        vaultSchemaVersion: manifest.vaultSchemaVersion,
        serviceWorkerReleaseId: manifest.serviceWorkerReleaseId,
        attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(retryDelayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  verifyLiveProduction()
    .then((result) => {
      console.log(
        `live production verified: ${result.siteUrl} @ ${result.commitSha} (${result.appVersion}, SW ${result.serviceWorkerReleaseId})`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

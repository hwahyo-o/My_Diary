/* global process, console */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REQUIRED_BYPASS_FRAGMENTS = ['/api/', '/runtime/', '/finance/', '/vault/', '/backup/', '/import/', '/export/'];

export function verifyServiceWorkerRelease(source) {
  const releaseMatch = source.match(/const\s+RELEASE_ID\s*=\s*['"]([^'"]+)['"]/);
  const releaseId = releaseMatch?.[1];
  if (!releaseId || !/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(releaseId)) {
    throw new Error('Service worker RELEASE_ID must use YYYY.MM.DD.N release format');
  }

  if (!/CACHE_NAME\s*=\s*`\$\{CACHE_PREFIX\}\$\{RELEASE_ID\}`/.test(source)) {
    throw new Error('Service worker cache name must include RELEASE_ID');
  }

  if (!/endsWith\(\s*['"]\.vault['"]\s*\)/.test(source)) {
    throw new Error('Service worker must bypass .vault requests');
  }

  for (const fragment of REQUIRED_BYPASS_FRAGMENTS) {
    if (!source.includes(`'${fragment}'`) && !source.includes(`"${fragment}"`)) {
      throw new Error(`Service worker missing sensitive bypass path: ${fragment}`);
    }
  }

  if (!/request\.method\s*!==\s*['"]GET['"]/.test(source)) {
    throw new Error('Service worker must bypass non-GET requests');
  }

  return { releaseId };
}

export async function verifyServiceWorkerFile(path = 'public/sw.js') {
  return verifyServiceWorkerRelease(await readFile(path, 'utf8'));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  verifyServiceWorkerFile(process.argv[2] ?? 'public/sw.js')
    .then(({ releaseId }) => console.log(`service worker release verified (${releaseId})`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

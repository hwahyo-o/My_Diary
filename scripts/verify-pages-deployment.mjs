/* global process, console */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function normalizedBase(basePath) {
  if (!basePath.startsWith('/') || !basePath.endsWith('/')) {
    throw new Error('Pages base path must start and end with /.');
  }
  return basePath;
}

export async function verifyPagesDeployment(distDir = 'dist', expectedBase = '/My_Diary/') {
  const basePath = normalizedBase(expectedBase);
  const [html, manifestSource, sw] = await Promise.all([
    readFile(join(distDir, 'index.html'), 'utf8'),
    readFile(join(distDir, 'manifest.webmanifest'), 'utf8'),
    readFile(join(distDir, 'sw.js'), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestSource);

  const absoluteRefs = [...html.matchAll(/(?:src|href)=["'](\/[^"']+)["']/g)].map((match) => match[1]);
  const badRefs = absoluteRefs.filter((reference) => !reference.startsWith(basePath));
  if (badRefs.length > 0) {
    throw new Error(`Pages HTML contains root-hosted asset references: ${badRefs.join(', ')}`);
  }
  if (!html.includes(`href="${basePath}manifest.webmanifest"`) && !html.includes(`href='${basePath}manifest.webmanifest'`)) {
    throw new Error('Pages manifest link does not use the project base path.');
  }
  if (manifest.start_url !== './' || manifest.scope !== './') {
    throw new Error('PWA manifest start_url and scope must be relative for project Pages.');
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.some((icon) => typeof icon.src !== 'string' || icon.src.startsWith('/'))) {
    throw new Error('PWA manifest icons must use relative paths.');
  }
  if (!sw.includes("new URL('./', self.location.href).pathname")) {
    throw new Error('Service worker must derive its project base path from its own URL.');
  }
  if (/APP_SHELL\s*=\s*\[\s*['"]\/['"]/.test(sw)) {
    throw new Error('Service worker app shell must not pin the origin root.');
  }
  return { basePath };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  verifyPagesDeployment(process.argv[2] ?? 'dist', process.argv[3] ?? '/My_Diary/')
    .then(({ basePath }) => console.log(`GitHub Pages deployment verified (${basePath})`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

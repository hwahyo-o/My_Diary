import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyPagesDeployment } from './verify-pages-deployment.mjs';

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture({ base = '/My_Diary/', manifestStart = './', swBaseAware = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'my-diary-pages-'));
  roots.push(root);
  await mkdir(join(root, 'icons'), { recursive: true });
  await writeFile(join(root, 'index.html'), `<link rel="manifest" href="${base}manifest.webmanifest"><script type="module" src="${base}assets/app.js"></script>`);
  await writeFile(join(root, 'manifest.webmanifest'), JSON.stringify({
    start_url: manifestStart,
    scope: './',
    icons: [{ src: 'icons/app-icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }));
  await writeFile(join(root, 'sw.js'), swBaseAware
    ? "const BASE_PATH = new URL('./', self.location.href).pathname;"
    : "const APP_SHELL = ['/', '/index.html'];");
  return root;
}

describe('GitHub Pages deployment contract', () => {
  it('accepts the My_Diary project-site base path and relative PWA navigation', async () => {
    const root = await fixture();
    await expect(verifyPagesDeployment(root, '/My_Diary/')).resolves.toMatchObject({
      basePath: '/My_Diary/',
    });
  });

  it('rejects root-hosted output that would break on a project Pages URL', async () => {
    const root = await fixture({ base: '/', manifestStart: '/', swBaseAware: false });
    await expect(verifyPagesDeployment(root, '/My_Diary/')).rejects.toThrow();
  });
});

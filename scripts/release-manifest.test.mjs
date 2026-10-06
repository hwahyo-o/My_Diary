// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createReleaseManifest, verifyReleaseManifest } from './release-manifest.mjs';

describe('release manifest', () => {
  it('records commit, app/schema/SW versions and SHA-256 hashes for dist artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'my-diary-release-'));
    const dist = join(root, 'dist');
    await mkdir(join(dist, 'assets'), { recursive: true });
    await writeFile(join(dist, 'index.html'), '<html>safe</html>');
    await writeFile(join(dist, 'assets/app.js'), 'console.log("safe")');
    const sw = join(root, 'sw.js');
    await writeFile(sw, "const RELEASE_ID = '2026.10.06.1';");

    const manifest = await createReleaseManifest({
      distDir: dist,
      commitSha: 'abcdef1234567890',
      appVersion: '0.1.0',
      vaultSchemaVersion: 1,
      serviceWorkerPath: sw,
    });

    expect(manifest).toMatchObject({
      format: 'my-diary-release-manifest',
      version: 1,
      commitSha: 'abcdef1234567890',
      appVersion: '0.1.0',
      vaultSchemaVersion: 1,
      serviceWorkerReleaseId: '2026.10.06.1',
    });
    expect(manifest.artifacts.map((item) => item.path)).toEqual(['assets/app.js', 'index.html']);
    expect(manifest.artifacts.every((item) => /^[a-f0-9]{64}$/.test(item.sha256))).toBe(true);

    await verifyReleaseManifest({ distDir: dist, manifest });
  });

  it('fails verification when a built artifact changes after manifest creation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'my-diary-release-'));
    const dist = join(root, 'dist');
    await mkdir(dist, { recursive: true });
    await writeFile(join(dist, 'index.html'), '<html>safe</html>');
    const sw = join(root, 'sw.js');
    await writeFile(sw, "const RELEASE_ID = '2026.10.06.1';");
    const manifest = await createReleaseManifest({
      distDir: dist,
      commitSha: 'abcdef1234567890',
      appVersion: '0.1.0',
      vaultSchemaVersion: 1,
      serviceWorkerPath: sw,
    });
    await writeFile(join(dist, 'index.html'), '<html>tampered</html>');

    await expect(verifyReleaseManifest({ distDir: dist, manifest })).rejects.toThrow(/hash mismatch/i);
  });

  it('can verify the serialized release-manifest.json written to dist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'my-diary-release-'));
    const dist = join(root, 'dist');
    await mkdir(dist, { recursive: true });
    await writeFile(join(dist, 'index.html'), '<html>safe</html>');
    const sw = join(root, 'sw.js');
    await writeFile(sw, "const RELEASE_ID = '2026.10.06.1';");
    const manifest = await createReleaseManifest({
      distDir: dist,
      commitSha: 'abcdef1234567890',
      appVersion: '0.1.0',
      vaultSchemaVersion: 1,
      serviceWorkerPath: sw,
    });
    await writeFile(join(dist, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
    const loaded = JSON.parse(await readFile(join(dist, 'release-manifest.json'), 'utf8'));

    await verifyReleaseManifest({ distDir: dist, manifest: loaded });
  });
});

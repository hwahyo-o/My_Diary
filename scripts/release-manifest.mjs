/* global process, console */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

async function walk(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, path));
    else files.push(path);
  }
  return files;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseServiceWorkerReleaseId(source) {
  const match = source.match(/const\s+RELEASE_ID\s*=\s*['"]([^'"]+)['"]/);
  if (!match?.[1]) throw new Error('Service worker RELEASE_ID is missing.');
  return match[1];
}

async function artifactEntries(distDir) {
  const files = (await walk(distDir))
    .filter((file) => relative(distDir, file).replaceAll('\\', '/') !== 'release-manifest.json')
    .sort((a, b) => relative(distDir, a).localeCompare(relative(distDir, b)));
  return Promise.all(files.map(async (file) => ({
    path: relative(distDir, file).replaceAll('\\', '/'),
    sha256: sha256(await readFile(file)),
  })));
}

export async function createReleaseManifest({
  distDir,
  commitSha,
  appVersion,
  vaultSchemaVersion,
  serviceWorkerPath,
}) {
  if (!/^[a-f0-9]{7,40}$/i.test(commitSha)) throw new Error('A valid Git commit SHA is required.');
  const serviceWorkerReleaseId = parseServiceWorkerReleaseId(await readFile(serviceWorkerPath, 'utf8'));
  return Object.freeze({
    format: 'my-diary-release-manifest',
    version: 1,
    commitSha,
    appVersion,
    vaultSchemaVersion,
    serviceWorkerReleaseId,
    artifacts: Object.freeze(await artifactEntries(distDir)),
  });
}

export async function verifyReleaseManifest({ distDir, manifest }) {
  if (manifest?.format !== 'my-diary-release-manifest' || manifest?.version !== 1) {
    throw new Error('Unsupported release manifest.');
  }
  const actual = await artifactEntries(distDir);
  const expected = [...manifest.artifacts].sort((a, b) => a.path.localeCompare(b.path));
  if (actual.length !== expected.length) throw new Error('Release artifact set mismatch.');

  for (let index = 0; index < actual.length; index += 1) {
    const current = actual[index];
    const recorded = expected[index];
    if (!current || !recorded || current.path !== recorded.path) {
      throw new Error('Release artifact set mismatch.');
    }
    if (current.sha256 !== recorded.sha256) {
      throw new Error(`Release artifact hash mismatch: ${current.path}`);
    }
  }
  return { artifactsVerified: actual.length };
}

export async function writeReleaseManifest(options) {
  const manifest = await createReleaseManifest(options);
  await writeFile(join(options.distDir, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await verifyReleaseManifest({ distDir: options.distDir, manifest });
  return manifest;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  const [distDir = 'dist', commitSha = process.env.GITHUB_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? process.env.RELEASE_SHA] = process.argv.slice(2);
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const schemaSource = await readFile('src/app/runtime/browser-runtime.ts', 'utf8');
  const schemaMatch = schemaSource.match(/const\s+SCHEMA_VERSION\s*=\s*(\d+)/);
  if (!commitSha) {
    console.error('Release manifest requires GITHUB_SHA or RELEASE_SHA.');
    process.exitCode = 1;
  } else if (!schemaMatch?.[1]) {
    console.error('Vault schema version could not be resolved.');
    process.exitCode = 1;
  } else {
    writeReleaseManifest({
      distDir,
      commitSha,
      appVersion: packageJson.version,
      vaultSchemaVersion: Number(schemaMatch[1]),
      serviceWorkerPath: 'public/sw.js',
    })
      .then((manifest) => console.log(`release manifest written (${manifest.artifacts.length} artifacts)`))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      });
  }
}

import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
];

const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json', '.webmanifest']);
const EXECUTABLE_EXTENSIONS = new Set(['.html', '.js', '.css']);
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:api[_-]?key|secret|token)\s*[:=]\s*['"][^'"]{12,}['"]/i,
  /\bRECOVERY_KEY(?:_SAMPLE)?\s*=\s*['"][^'"]+['"]/,
];

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

function extractMetaCsp(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!/http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag)) continue;
    const match = tag.match(/content\s*=\s*["']([^"']+)["']/i);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function assertSafeCsp(csp) {
  if (!csp) throw new Error('Content-Security-Policy meta fallback is missing');
  const normalized = csp.replace(/\s+/g, ' ').trim();
  if (/\b(?:default-src|script-src)\s+[^;]*\*/i.test(normalized)) {
    throw new Error('CSP contains a wildcard executable/default source');
  }
  if (/\bscript-src\s+[^;]*'unsafe-(?:eval|inline)'/i.test(normalized)) {
    throw new Error('CSP weakens script execution policy');
  }
  for (const directive of REQUIRED_CSP) {
    if (!normalized.includes(directive)) throw new Error(`CSP missing required directive: ${directive}`);
  }
}

function assertNoExternalRuntimeOrigin(content, path) {
  const patterns = [
    /\b(?:src|href)\s*=\s*["']https?:\/\//i,
    /\bfetch\s*\(\s*["']https?:\/\//i,
    /\bnew\s+WebSocket\s*\(\s*["']wss?:\/\//i,
    /\bimport\s*\(\s*["']https?:\/\//i,
    /(?:url|@import)\s*\(?\s*["']?https?:\/\//i,
  ];
  if (patterns.some((pattern) => pattern.test(content))) {
    throw new Error(`External origin reference found in production executable artifact: ${path}`);
  }
}

function assertNoSecretLikeMaterial(content, path) {
  if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) {
    throw new Error(`Secret-like material found in production artifact: ${path}`);
  }
}

export async function verifyDistSecurity(distPath = 'dist') {
  const files = await walk(distPath);
  if (files.some((file) => file.toLowerCase().endsWith('.map'))) {
    throw new Error('Production source map files are not allowed');
  }

  const indexPath = join(distPath, 'index.html');
  const indexHtml = await readFile(indexPath, 'utf8');
  assertSafeCsp(extractMetaCsp(indexHtml));

  let filesScanned = 0;
  for (const file of files) {
    const extension = extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const content = await readFile(file, 'utf8');
    const displayPath = relative(distPath, file);
    filesScanned += 1;
    assertNoSecretLikeMaterial(content, displayPath);
    if (EXECUTABLE_EXTENSIONS.has(extension)) assertNoExternalRuntimeOrigin(content, displayPath);
  }

  return { filesScanned };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  verifyDistSecurity(process.argv[2] ?? 'dist')
    .then(({ filesScanned }) => console.log(`dist security verified (${filesScanned} text artifacts scanned)`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

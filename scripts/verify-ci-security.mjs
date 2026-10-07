/* global process, console */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const WORKFLOWS = [
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-pages.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/dependency-review.yml',
];
const AUDITED_INSTALL_WORKFLOWS = new Set([
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-pages.yml',
]);
const PINNED_ACTION = /^\s*-?\s*uses:\s*[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}(?:\s+#.*)?$/;

export async function verifyCiSecurity(read = readFile) {
  const contents = [];
  for (const path of WORKFLOWS) {
    const content = await read(path, 'utf8');
    contents.push([path, content]);

    for (const line of content.split(/\r?\n/)) {
      if (line.includes('uses:') && !PINNED_ACTION.test(line)) {
        throw new Error(`Unpinned GitHub Action reference in ${path}: ${line.trim()}`);
      }
    }

    if (AUDITED_INSTALL_WORKFLOWS.has(path) && !content.includes('npm audit --audit-level=high')) {
      throw new Error(`Dependency vulnerability audit is missing in ${path}`);
    }
  }

  const ci = contents.find(([path]) => path.endsWith('/ci.yml'))?.[1] ?? '';
  if (!/permissions:\s*\n\s+contents:\s+read\b/.test(ci)) {
    throw new Error('CI workflow must declare contents: read permissions.');
  }
  if (!/persist-credentials:\s+false\b/.test(ci)) {
    throw new Error('CI checkout must disable credential persistence.');
  }

  const codeql = contents.find(([path]) => path.endsWith('/codeql.yml'))?.[1] ?? '';
  if (!/security-events:\s+write\b/.test(codeql)) {
    throw new Error('CodeQL workflow must declare security-events: write.');
  }

  const dependencyReview = contents.find(([path]) => path.endsWith('/dependency-review.yml'))?.[1] ?? '';
  if (!/fail-on-severity:\s+high\b/.test(dependencyReview)) {
    throw new Error('Dependency Review must fail on high-severity findings.');
  }

  return { workflowsChecked: WORKFLOWS.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  verifyCiSecurity()
    .then(({ workflowsChecked }) => console.log(`CI security verified (${workflowsChecked} workflows)`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

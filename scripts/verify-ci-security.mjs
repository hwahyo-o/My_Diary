/* global process, console */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/deploy-pages.yml'];
const PINNED_ACTION = /^\s*-?\s*uses:\s*[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}(?:\s+#.*)?$/;

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

    if (!content.includes('npm audit --audit-level=high')) {
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

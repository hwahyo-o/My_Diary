/* global process, console */
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const RELEASE_GATE_STEPS = [
  ['npm', ['run', 'lint']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['test']],
  ['npm', ['run', 'build']],
  ['npm', ['run', 'verify:dist-security']],
  ['npm', ['run', 'verify:ci-security']],
  ['npm', ['run', 'verify:sw-release']],
  ['npm', ['run', 'verify:pages']],
  ['npm', ['run', 'release:manifest']],
];

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
  });
}

export async function runReleaseGate(runner = runCommand) {
  for (const [command, args] of RELEASE_GATE_STEPS) {
    const exitCode = await runner(command, args);
    if (exitCode !== 0) {
      throw new Error(`Release gate failed: ${command} ${args.join(' ')} (exit ${exitCode})`);
    }
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  runReleaseGate()
    .then(() => console.log('release gate passed'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}

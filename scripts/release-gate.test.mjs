// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { RELEASE_GATE_STEPS, runReleaseGate } from './release-gate.mjs';

describe('final release gate', () => {
  it('runs every release verification in deterministic order', async () => {
    expect(RELEASE_GATE_STEPS).toEqual([
      ['npm', ['run', 'lint']],
      ['npm', ['run', 'typecheck']],
      ['npm', ['test']],
      ['npm', ['run', 'build']],
      ['npm', ['run', 'verify:dist-security']],
      ['npm', ['run', 'verify:ci-security']],
      ['npm', ['run', 'verify:sw-release']],
      ['npm', ['run', 'verify:pages']],
      ['npm', ['run', 'release:manifest']],
    ]);

    const calls = [];
    await runReleaseGate(async (command, args) => {
      calls.push([command, args]);
      return 0;
    });
    expect(calls).toEqual(RELEASE_GATE_STEPS);
  });

  it('fails fast and does not run later release checks after a failed step', async () => {
    const runner = vi.fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    await expect(runReleaseGate(runner)).rejects.toThrow(/typecheck/i);
    expect(runner).toHaveBeenCalledTimes(2);
  });
});

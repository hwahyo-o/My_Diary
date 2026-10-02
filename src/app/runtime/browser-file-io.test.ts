import { describe, expect, it, vi } from 'vitest';
import { MAX_VAULT_FILE_BYTES, makeVaultFilename, readVaultFile } from './browser-file-io';

describe('browser vault file IO', () => {
  it('creates random opaque .vault filenames without profile metadata', () => {
    const first = makeVaultFilename(new Uint8Array([1,2,3,4,5,6]));
    const second = makeVaultFilename(new Uint8Array([6,5,4,3,2,1]));
    expect(first).toMatch(/^vault-[A-F0-9]{12}\.vault$/);
    expect(second).toMatch(/^vault-[A-F0-9]{12}\.vault$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain('예현');
  });

  it('rejects oversized files before reading them into memory', async () => {
    const arrayBuffer = vi.fn();
    const file = { size: MAX_VAULT_FILE_BYTES + 1, arrayBuffer } as unknown as File;
    await expect(readVaultFile(file)).rejects.toThrow(/50 MiB/i);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('reads supported files as Uint8Array', async () => {
    const file = new File([new Uint8Array([1,2,3])], 'backup.vault');
    await expect(readVaultFile(file)).resolves.toEqual(new Uint8Array([1,2,3]));
  });
});

import { describe, expect, it } from 'vitest';
import { VaultSession } from './session';

describe('VaultSession', () => {
  it('imports VaultKey as non-extractable and zeroes the supplied raw bytes', async () => {
    const raw = new Uint8Array(32).fill(41);
    const session = await VaultSession.unlock(raw);

    expect(session.isUnlocked).toBe(true);
    expect([...raw]).toEqual(new Array(32).fill(0));

    await session.withVaultKey(async (key) => {
      expect(key.extractable).toBe(false);
      expect(key.algorithm.name).toBe('AES-GCM');
      await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    });
  });

  it('drops the key reference and rejects access immediately after lock', async () => {
    const session = await VaultSession.unlock(new Uint8Array(32).fill(42));
    session.lock();

    expect(session.isUnlocked).toBe(false);
    expect(() => session.withVaultKey(() => undefined)).toThrow(/locked/i);
  });
});

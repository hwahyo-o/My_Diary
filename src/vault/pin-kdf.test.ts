import { describe, expect, it } from 'vitest';
import { deriveDeviceKek, TEST_ARGON2_PARAMS } from './pin-kdf';
import { unwrapVaultKey, wrapVaultKey } from './key-wrap';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('deriveDeviceKek', () => {
  it('is deterministic for the same PIN, device secret, salt, and parameters', async () => {
    const secret = new Uint8Array(32).fill(7);
    const salt = new Uint8Array(16).fill(9);

    const a = await deriveDeviceKek('583204', secret, salt, TEST_ARGON2_PARAMS);
    const b = await deriveDeviceKek('583204', secret, salt, TEST_ARGON2_PARAMS);

    expect([...a]).toEqual([...b]);
    expect(a).toHaveLength(32);
  });

  it('changes when the PIN or device secret changes', async () => {
    const salt = new Uint8Array(16).fill(3);
    const a = await deriveDeviceKek('583204', new Uint8Array(32).fill(1), salt, TEST_ARGON2_PARAMS);
    const b = await deriveDeviceKek('583205', new Uint8Array(32).fill(1), salt, TEST_ARGON2_PARAMS);
    const c = await deriveDeviceKek('583204', new Uint8Array(32).fill(2), salt, TEST_ARGON2_PARAMS);

    expect([...a]).not.toEqual([...b]);
    expect([...a]).not.toEqual([...c]);
  });
});

describe('device VaultKey wrapping', () => {
  it('round-trips a raw VaultKey and fails closed with the wrong KEK', async () => {
    const vaultKey = new Uint8Array(32).map((_, index) => index + 1);
    const correctKek = new Uint8Array(32).fill(11);
    const wrongKek = new Uint8Array(32).fill(12);
    const aad = bytes(1, 2, 3, 4);

    const wrapped = await wrapVaultKey(vaultKey, correctKek, aad);
    const restored = await unwrapVaultKey(wrapped, correctKek, aad);

    expect([...restored]).toEqual([...vaultKey]);
    await expect(unwrapVaultKey(wrapped, wrongKek, aad)).rejects.toThrow();
  });

  it('rejects tampered wrapped ciphertext', async () => {
    const vaultKey = new Uint8Array(32).fill(21);
    const kek = new Uint8Array(32).fill(22);
    const wrapped = await wrapVaultKey(vaultKey, kek);
    const tampered = { ...wrapped, ciphertext: wrapped.ciphertext.slice() };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 0xff;

    await expect(unwrapVaultKey(tampered, kek)).rejects.toThrow();
  });
});

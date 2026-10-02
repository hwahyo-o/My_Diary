import { describe, expect, it } from 'vitest';
import { deriveRecoveryKek } from './recovery';
import { unwrapVaultKey, wrapVaultKey } from './key-wrap';
import { decryptRecord, encryptRecord, type RecordAad } from './record-crypto';

const aad: RecordAad = {
  vaultId: 'vault-a',
  recordId: 'record-1',
  recordType: 'transaction',
  schemaVersion: 1,
  recordVersion: 3,
};

describe('recovery wrapping', () => {
  it('derives a recovery KEK that can wrap and restore a VaultKey independently of PIN', async () => {
    const recoveryKey = new Uint8Array(32).fill(31);
    const vaultKey = new Uint8Array(32).fill(47);
    const kek = await deriveRecoveryKek(recoveryKey, 'vault-a');
    const wrapped = await wrapVaultKey(vaultKey, kek);

    expect([...await unwrapVaultKey(wrapped, kek)]).toEqual([...vaultKey]);
    await expect(unwrapVaultKey(wrapped, await deriveRecoveryKek(new Uint8Array(32).fill(32), 'vault-a'))).rejects.toThrow();
  });
});

describe('record AES-GCM crypto', () => {
  it('round-trips JSON while ciphertext does not expose the plaintext memo', async () => {
    const key = new Uint8Array(32).fill(19);
    const plaintext = { amountMinor: 13000, memo: '점심 만삼천', category: 'food' };

    const encrypted = await encryptRecord(key, aad, plaintext);
    const ciphertextText = new TextDecoder().decode(encrypted.ciphertext);
    expect(ciphertextText).not.toContain('점심 만삼천');
    await expect(decryptRecord(key, aad, encrypted)).resolves.toEqual(plaintext);
  });

  it('rejects AAD mismatch and ciphertext modification', async () => {
    const key = new Uint8Array(32).fill(20);
    const encrypted = await encryptRecord(key, aad, { memo: 'private' });
    const wrongAad = { ...aad, recordVersion: aad.recordVersion + 1 };
    const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.slice() };
    tampered.ciphertext[0] ^= 0xff;

    await expect(decryptRecord(key, wrongAad, encrypted)).rejects.toThrow();
    await expect(decryptRecord(key, aad, tampered)).rejects.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { TEST_ARGON2_PARAMS } from '../vault/pin-kdf';
import { deriveCloudAuthSecret, deriveCloudKek, deriveCloudRootKey } from './key-derivation';

describe('cloud sync key derivation', () => {
  it('derives a stable account root key from PIN and account salt', async () => {
    const salt = new Uint8Array(32).fill(9);
    const rootA = await deriveCloudRootKey('5831049276', salt, TEST_ARGON2_PARAMS);
    const rootB = await deriveCloudRootKey('5831049276', salt, TEST_ARGON2_PARAMS);
    const rootOtherPin = await deriveCloudRootKey('5831049277', salt, TEST_ARGON2_PARAMS);

    expect(rootA).toEqual(rootB);
    expect(rootA).not.toEqual(rootOtherPin);
    expect(rootA).toHaveLength(32);
  });


  it('derives stable but domain-separated keys', async () => {
    const root = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const salt = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);

    const authA = await deriveCloudAuthSecret(root, salt);
    const authB = await deriveCloudAuthSecret(root, salt);
    const cloudKek = await deriveCloudKek(root, salt);

    expect(authA).toEqual(authB);
    expect(authA).not.toEqual(cloudKek);
    expect(authA).toHaveLength(32);
    expect(cloudKek).toHaveLength(32);
  });

  it('changes derived output when account salt changes', async () => {
    const root = new Uint8Array(32).fill(7);
    const saltA = new Uint8Array(32).fill(1);
    const saltB = new Uint8Array(32).fill(2);

    expect(await deriveCloudAuthSecret(root, saltA))
      .not.toEqual(await deriveCloudAuthSecret(root, saltB));
  });
});

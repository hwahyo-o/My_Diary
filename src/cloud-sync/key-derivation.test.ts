import { describe, expect, it } from 'vitest';
import { deriveCloudAuthSecret, deriveCloudKek } from './key-derivation';

describe('cloud sync key derivation', () => {
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

import { describe, expect, it } from 'vitest';
import { generateDeviceSecret, generateRecoveryKey, generateVaultKey } from './key-material';
import { assertValidPin } from './pin-policy';

describe('key material', () => {
  it('generates independent 32-byte secret values', () => {
    const vaultKey = generateVaultKey();
    const deviceSecret = generateDeviceSecret();
    const recoveryKey = generateRecoveryKey();

    expect(vaultKey).toHaveLength(32);
    expect(deviceSecret).toHaveLength(32);
    expect(recoveryKey).toHaveLength(32);
    expect([...vaultKey]).not.toEqual([...deviceSecret]);
    expect([...vaultKey]).not.toEqual([...recoveryKey]);
  });
});

describe('PIN policy', () => {
  it('accepts a non-trivial six digit numeric PIN', () => {
    expect(() => assertValidPin('583204')).not.toThrow();
  });

  it.each(['12345', '1234567', '12a456', '111111', '000000', '123456', '654321'])('rejects weak or malformed PIN %s', (pin) => {
    expect(() => assertValidPin(pin)).toThrow(TypeError);
  });
});

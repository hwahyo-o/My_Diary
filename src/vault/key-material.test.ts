import { describe, expect, it } from 'vitest';
import { generateDeviceSecret, generateRecoveryKey, generateVaultKey } from './key-material';
import { assertStrongPin, assertSupportedPin } from './pin-policy';

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

describe('PIN policy compatibility', () => {
  it('accepts a non-trivial legacy six digit PIN for unlock compatibility', () => {
    expect(() => assertSupportedPin('583204')).not.toThrow();
  });

  it('requires stronger 10 to 12 digit PINs for new credentials', () => {
    expect(() => assertStrongPin('5832047169')).not.toThrow();
    expect(() => assertStrongPin('583204')).toThrow(TypeError);
  });

  it.each(['12345', '1234567', '12a456', '111111', '000000', '123456', '654321'])('rejects weak or malformed supported PIN %s', (pin) => {
    expect(() => assertSupportedPin(pin)).toThrow(TypeError);
  });
});

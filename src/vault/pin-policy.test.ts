import { describe, expect, it } from 'vitest';
import { assertStrongPin, assertSupportedPin } from './pin-policy';

describe('PIN policy', () => {
  it('keeps legacy six-digit PINs unlock-compatible', () => {
    expect(() => assertSupportedPin('583204')).not.toThrow();
  });

  it('requires 10 to 12 digits for newly created device credentials', () => {
    expect(() => assertStrongPin('583204')).toThrow(/10 to 12/);
    expect(() => assertStrongPin('5832047169')).not.toThrow();
  });

  it('rejects repeated and sequential weak PIN patterns', () => {
    expect(() => assertStrongPin('1111111111')).toThrow(/weak/i);
    expect(() => assertStrongPin('0123456789')).toThrow(/weak/i);
    expect(() => assertStrongPin('1212121212')).toThrow(/weak/i);
  });
});

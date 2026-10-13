import { describe, expect, it } from 'vitest';
import {
  fromBase64Url,
  hasAllowedOrigin,
  isValidNickname,
  readJsonBody,
} from './cloud-sync.js';

describe('cloud sync request hardening', () => {
  it('accepts only same-origin browser requests when Origin is present', () => {
    expect(hasAllowedOrigin(new Request('https://example.test/api/account/login', {
      headers: { origin: 'https://example.test' },
    }))).toBe(true);
    expect(hasAllowedOrigin(new Request('https://example.test/api/account/login', {
      headers: { origin: 'https://evil.test' },
    }))).toBe(false);
  });

  it('bounds normalized nickname length', () => {
    expect(isValidNickname('예현')).toBe(true);
    expect(isValidNickname('')).toBe(false);
    expect(isValidNickname('a'.repeat(64))).toBe(true);
    expect(isValidNickname('a'.repeat(65))).toBe(false);
  });

  it('rejects non-base64url characters', () => {
    expect(() => fromBase64Url('abc+def')).toThrow(/base64url/i);
    expect(() => fromBase64Url('abc/def')).toThrow(/base64url/i);
  });

  it('rejects oversized JSON before parsing', async () => {
    const request = new Request('https://example.test/api/account/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '5000',
      },
      body: JSON.stringify({ value: 'x' }),
    });
    await expect(readJsonBody(request, 4096)).rejects.toThrow(/too large/i);
  });

  it('parses a bounded JSON body', async () => {
    const request = new Request('https://example.test/api/account/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: '예현' }),
    });
    await expect(readJsonBody(request)).resolves.toEqual({ nickname: '예현' });
  });
});

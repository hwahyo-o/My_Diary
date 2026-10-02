import { describe, expect, it } from 'vitest';
import {
  createMoney,
  parseISODate,
  parseISODateTime,
  parseUUID,
} from './types';

describe('Money', () => {
  it('accepts safe integer KRW minor units', () => {
    expect(createMoney(13000)).toEqual({ amountMinor: 13000, currency: 'KRW' });
  });

  it('rejects fractional minor units', () => {
    expect(() => createMoney(12.5)).toThrow(/safe integer/i);
  });

  it('rejects unsafe integer minor units', () => {
    expect(() => createMoney(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/i);
  });
});

describe('branded runtime parsers', () => {
  it('accepts canonical UUID values', () => {
    expect(parseUUID('123e4567-e89b-42d3-a456-426614174000')).toBe(
      '123e4567-e89b-42d3-a456-426614174000',
    );
  });

  it('rejects malformed UUID values', () => {
    expect(() => parseUUID('not-a-uuid')).toThrow(/uuid/i);
  });

  it('accepts real ISO calendar dates and rejects impossible dates', () => {
    expect(parseISODate('2026-10-02')).toBe('2026-10-02');
    expect(() => parseISODate('2026-02-30')).toThrow(/date/i);
  });

  it('accepts timezone-aware ISO date-times and rejects timezone-less values', () => {
    expect(parseISODateTime('2026-10-02T13:07:00+09:00')).toBe(
      '2026-10-02T13:07:00+09:00',
    );
    expect(() => parseISODateTime('2026-10-02T13:07:00')).toThrow(/date-time/i);
  });
});

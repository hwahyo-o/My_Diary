export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type UUID = Brand<string, 'UUID'>;
export type ISODate = Brand<string, 'ISODate'>;
export type ISODateTime = Brand<string, 'ISODateTime'>;
export type Currency = 'KRW';

export interface Money {
  readonly amountMinor: number;
  readonly currency: Currency;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function createMoney(amountMinor: number): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new TypeError('Money amountMinor must be a safe integer.');
  }
  return { amountMinor, currency: 'KRW' };
}

export function parseUUID(value: string): UUID {
  if (!UUID_RE.test(value)) throw new TypeError('Invalid UUID.');
  return value as UUID;
}

export function parseISODate(value: string): ISODate {
  if (!DATE_RE.test(value)) throw new TypeError('Invalid ISO date.');

  const parts = value.split('-');
  const yearPart = parts[0];
  const monthPart = parts[1];
  const dayPart = parts[2];
  if (yearPart === undefined || monthPart === undefined || dayPart === undefined) {
    throw new TypeError('Invalid ISO date.');
  }

  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError('Invalid ISO date.');
  }

  return value as ISODate;
}

export function parseISODateTime(value: string): ISODateTime {
  if (!DATE_TIME_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TypeError('Invalid ISO date-time.');
  }
  return value as ISODateTime;
}

export interface EntityMeta {
  readonly id: UUID;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
  readonly version: number;
}

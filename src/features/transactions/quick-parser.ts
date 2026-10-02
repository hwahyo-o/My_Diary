import { parseISODateTime, type ISODateTime, type UUID } from '../../domain/shared/types';
import type { TransactionType } from '../../domain/transactions/types';
import type { TransactionDraft } from './types';
import { validateTransactionDraft } from './validation';

export interface QuickInputCandidate {
  readonly rawText: string;
  readonly amountMinor?: number;
  readonly occurredAt: ISODateTime;
  readonly merchantText?: string;
  readonly categoryHint?: 'food' | 'transport';
  readonly unresolved: readonly ('amount')[];
}

const KOREAN_DIGIT: Record<string, number> = {
  일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9,
};

function parseBelow10000(text: string): number | undefined {
  if (!text) return 0;
  let result = 0;
  let digit = 0;
  let matched = false;
  const units: Record<string, number> = { 천: 1000, 백: 100, 십: 10 };

  for (const char of text) {
    if (KOREAN_DIGIT[char] !== undefined) {
      digit = KOREAN_DIGIT[char]!;
      matched = true;
      continue;
    }
    const unit = units[char];
    if (unit !== undefined) {
      result += (digit || 1) * unit;
      digit = 0;
      matched = true;
      continue;
    }
    return undefined;
  }
  return matched ? result + digit : undefined;
}

function parseKoreanAmount(token: string): number | undefined {
  if (!token) return undefined;
  if (/^\d+$/.test(token)) {
    const value = Number(token);
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }

  const manIndex = token.indexOf('만');
  if (manIndex >= 0) {
    const highText = token.slice(0, manIndex);
    const lowText = token.slice(manIndex + 1);
    const high = highText ? parseBelow10000(highText) : 1;
    const low = parseBelow10000(lowText);
    if (high === undefined || low === undefined) return undefined;
    return high * 10000 + low;
  }

  return parseBelow10000(token);
}

function previousDay(now: ISODateTime): ISODateTime {
  const date = new Date(Date.parse(now) - 86_400_000);
  return parseISODateTime(date.toISOString());
}

export function parseQuickInput(rawText: string, now: ISODateTime): QuickInputCandidate {
  const tokens = rawText.trim().split(/\s+/).filter(Boolean);
  let amountMinor: number | undefined;
  let occurredAt = now;
  let categoryHint: QuickInputCandidate['categoryHint'];

  for (const token of tokens) {
    const parsed = parseKoreanAmount(token);
    if (parsed !== undefined && parsed > 0) amountMinor = parsed;
    if (token === '어제') occurredAt = previousDay(now);
    if (token.includes('점심') || token.includes('식사')) categoryHint = 'food';
    if (token.includes('택시') || token.includes('버스') || token.includes('지하철')) categoryHint = 'transport';
  }

  const merchantTokens = tokens.filter((token) => {
    if (token === '오늘' || token === '어제') return false;
    if (parseKoreanAmount(token) !== undefined) return false;
    return true;
  });

  return {
    rawText,
    amountMinor,
    occurredAt,
    merchantText: merchantTokens.join(' ') || undefined,
    categoryHint,
    unresolved: amountMinor === undefined ? ['amount'] : [],
  };
}

export function quickCandidateToDraft(
  candidate: QuickInputCandidate,
  options: { readonly accountId: UUID; readonly type: TransactionType },
): TransactionDraft {
  if (candidate.amountMinor === undefined) throw new TypeError('Quick input amount is unresolved.');
  return validateTransactionDraft({
    type: options.type,
    accountId: options.accountId,
    amountMinor: candidate.amountMinor,
    occurredAt: candidate.occurredAt,
    merchant: candidate.merchantText,
    categoryId: candidate.categoryHint,
    source: 'quick',
    fixedVariable: 'variable',
  });
}

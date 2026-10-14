import { type ISODateTime, type UUID } from '../../domain/shared/types';
import type { FixedVariable, TransactionType } from '../../domain/transactions/types';
import {
  classifyTransactionText,
  type ClassificationRuleSet,
  type TransactionClassification,
} from './classification-engine';
import type { TransactionDraft } from './types';
import { validateTransactionDraft } from './validation';

export interface QuickInputCandidate {
  readonly rawText: string;
  readonly amountMinor?: number;
  readonly occurredAt: ISODateTime;
  readonly merchantText?: string;
  readonly categoryHint?: 'food' | 'transport';
  readonly transactionType: TransactionType;
  readonly categoryId: string;
  readonly fixedVariable: FixedVariable;
  readonly classification: TransactionClassification;
  readonly unresolved: readonly ('amount' | 'multiple-amounts')[];
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
  const normalized = token.trim().replace(/^₩/, '').replace(/원$/, '').replace(/,/g, '');
  if (!normalized) return undefined;
  if (/^\d+$/.test(normalized)) {
    const value = Number(normalized);
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }

  const manIndex = normalized.indexOf('만');
  if (manIndex >= 0) {
    const highText = normalized.slice(0, manIndex);
    const lowText = normalized.slice(manIndex + 1);
    const high = highText ? parseBelow10000(highText) : 1;
    const low = parseBelow10000(lowText);
    if (high === undefined || low === undefined) return undefined;
    return high * 10000 + low;
  }

  return parseBelow10000(normalized);
}

function isRelativeDateToken(tokens: readonly string[], index: number): boolean {
  const token = tokens[index];
  if (!token) return false;
  if (token === '오늘' || token === '어제' || token === '그제' || token === '그저께') return true;
  if (/^\d{1,4}일전$/u.test(token)) return true;
  if (/^\d{1,4}일$/u.test(token) && tokens[index + 1] === '전') return true;
  if (token === '전' && /^\d{1,4}일$/u.test(tokens[index - 1] ?? '')) return true;
  return false;
}

function isStructuralToken(
  tokens: readonly string[],
  index: number,
  classification: TransactionClassification,
): boolean {
  const token = tokens[index];
  if (!token) return false;
  if (isRelativeDateToken(tokens, index)) return true;
  if (parseKoreanAmount(token) !== undefined) return true;

  const matched = [
    ...classification.transactionType.matchedKeywords,
  ];
  return matched.some((keyword) => token.includes(keyword));
}

export function splitQuickEntries(text: string): string[] {
  // Only explicit line/semicolon boundaries or comma after a completed won amount.
  // Never split the thousands separator in e.g. 4,500원.
  return text.split(/(?:[;；\n]+|(?<=원)[,，]\s*|(?<=\d)[,，]\s*(?=(?:오늘|어제|그제|그저께)\s))/u)
    .map((part) => part.trim()).filter(Boolean);
}

export function parseQuickInput(
  rawText: string,
  now: ISODateTime,
  rules?: ClassificationRuleSet,
): QuickInputCandidate {
  const tokens = rawText.trim().split(/\s+/).filter(Boolean);
  const classification = classifyTransactionText(rawText, now, rules);
  let amountMinor: number | undefined;
  let amountCount = 0;

  for (const token of tokens) {
    const parsed = parseKoreanAmount(token.replace(/[.!?;:,]+$/u, ''));
    if (parsed !== undefined && parsed > 0) {
      amountMinor = parsed;
      amountCount += 1;
    }
  }

  const merchantText = tokens
    .filter((_token, index) => !isStructuralToken(tokens, index, classification))
    .join(' ');

  const categoryHint = classification.categoryId.value === 'food'
    ? 'food' as const
    : classification.categoryId.value === 'transport'
      ? 'transport' as const
      : undefined;

  return {
    rawText,
    occurredAt: classification.occurredAt.value,
    transactionType: classification.transactionType.value,
    categoryId: classification.categoryId.value,
    fixedVariable: classification.fixedVariable.value,
    classification,
    unresolved: amountCount > 1 ? ['multiple-amounts'] : amountMinor === undefined ? ['amount'] : [],
    ...(amountMinor === undefined ? {} : { amountMinor }),
    ...(merchantText ? { merchantText } : {}),
    ...(categoryHint ? { categoryHint } : {}),
  };
}

export function quickCandidateToDraft(
  candidate: QuickInputCandidate,
  options: { readonly accountId: UUID; readonly type?: TransactionType },
): TransactionDraft {
  if (candidate.unresolved.includes('multiple-amounts')) throw new TypeError('Multiple monetary amounts require separate entries.');
  if (candidate.amountMinor === undefined) throw new TypeError('Quick input amount is unresolved.');
  const type = options.type ?? candidate.transactionType;

  return validateTransactionDraft({
    type,
    accountId: options.accountId,
    amountMinor: candidate.amountMinor,
    occurredAt: candidate.occurredAt,
    source: 'quick',
    fixedVariable: candidate.fixedVariable,
    ...(candidate.merchantText ? { merchant: candidate.merchantText } : {}),
    ...(candidate.categoryId === 'uncategorized' ? {} : { categoryId: candidate.categoryId }),
  });
}

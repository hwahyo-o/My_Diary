import { BUILTIN_CATEGORY_IDS, type BuiltinCategoryId } from './category-catalog';

export interface CorrectionObservation {
  readonly keyword: string;
  readonly categoryId: BuiltinCategoryId;
  readonly count: number;
}

export interface CorrectionSuggestion {
  readonly keyword: string;
  readonly categoryId: BuiltinCategoryId;
  readonly count: number;
}

const MAX_OBSERVATIONS = 40;
const MIN_REPETITIONS = 3;

export function extractCorrectionKeyword(merchantText: string | undefined): string | null {
  if (!merchantText) return null;
  const keyword = merchantText.normalize('NFKC').trim().toLocaleLowerCase('ko-KR');
  // Avoid inferring rules from names, full sentences, dates and noisy strings.
  if (!/^[\p{L}][\p{L}\p{N}]{1,19}$/u.test(keyword)) return null;
  if (/^(오늘|어제|그제|그저께|수입|지출)$/u.test(keyword)) return null;
  return keyword;
}

export function recordCorrection(
  existing: readonly CorrectionObservation[],
  merchantText: string | undefined,
  categoryId: string,
  autoCategoryId: string,
): CorrectionObservation[] {
  const keyword = extractCorrectionKeyword(merchantText);
  if (!keyword || categoryId === autoCategoryId || categoryId === 'uncategorized'
    || !BUILTIN_CATEGORY_IDS.includes(categoryId as BuiltinCategoryId)) return [...existing];
  const normalized = sanitizeCorrectionObservations(existing);
  const previous = normalized.find((item) => item.keyword === keyword && item.categoryId === categoryId);
  // Opposing corrections for the same word are treated as ambiguous, not accumulated.
  const next = normalized.filter((item) => item.keyword !== keyword);
  next.push({
    keyword,
    categoryId: categoryId as BuiltinCategoryId,
    count: previous ? Math.min(previous.count + 1, 99) : 1,
  });
  return next.slice(-MAX_OBSERVATIONS);
}

export function sanitizeCorrectionObservations(input: readonly CorrectionObservation[]): CorrectionObservation[] {
  if (!Array.isArray(input)) return [];
  const result: CorrectionObservation[] = [];
  for (const item of input.slice(-MAX_OBSERVATIONS)) {
    if (!item || typeof item.keyword !== 'string') continue;
    const keyword = extractCorrectionKeyword(item.keyword);
    if (!keyword || item.categoryId === 'uncategorized'
      || !BUILTIN_CATEGORY_IDS.includes(item.categoryId)
      || !Number.isSafeInteger(item.count) || item.count < 1) continue;
    result.push({ keyword, categoryId: item.categoryId, count: Math.min(item.count, 99) });
  }
  return result;
}

export function suggestCorrections(
  observations: readonly CorrectionObservation[],
  assignedKeywords: ReadonlySet<string>,
): CorrectionSuggestion[] {
  return sanitizeCorrectionObservations(observations)
    .filter((item) => item.count >= MIN_REPETITIONS && !assignedKeywords.has(item.keyword))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword, 'ko-KR'));
}

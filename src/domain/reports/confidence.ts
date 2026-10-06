import type { Confidence } from './types';

export interface ConfidenceInput {
  readonly transactionCoverage: number;
  readonly uncategorizedShare: number;
  readonly accountCoverage: number;
  readonly staleValuationCount: number;
  readonly comparisonMonths: number;
}

export function scoreReportConfidence(input: ConfidenceInput): Confidence {
  let score = 0;
  if (input.transactionCoverage >= 0.9) score += 2;
  else if (input.transactionCoverage >= 0.7) score += 1;

  if (input.uncategorizedShare <= 0.1) score += 2;
  else if (input.uncategorizedShare <= 0.3) score += 1;

  if (input.accountCoverage >= 0.9) score += 2;
  else if (input.accountCoverage >= 0.7) score += 1;

  if (input.staleValuationCount === 0) score += 1;
  if (input.comparisonMonths >= 3) score += 1;
  else if (input.comparisonMonths >= 1) score += 0.5;

  if (score >= 7) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

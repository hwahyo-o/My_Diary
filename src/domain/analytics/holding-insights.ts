import type { Holding } from '../holdings/types';
import type { ISODate, UUID } from '../shared/types';

export interface HoldingInsight {
  readonly holdingId: UUID;
  readonly ticker: string;
  readonly costBasisMinor: number;
  readonly marketValueMinor: number;
  readonly unrealizedChangeMinor: number;
  readonly returnPercent: number;
  readonly freshness: 'fresh' | 'stale';
  readonly tone: 'gain' | 'loss' | 'flat';
  readonly reason: string;
}

function daysBetween(from: ISODate, to: ISODate): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function selectHoldingInsights(
  holdings: readonly Holding[],
  asOf: ISODate,
): readonly HoldingInsight[] {
  return holdings.map((holding) => {
    const quantity = Number(holding.quantity);
    const costBasisMinor = Number.isFinite(quantity) ? Math.round(quantity * holding.avgCostMinor) : 0;
    const unrealizedChangeMinor = holding.marketValueMinor - costBasisMinor;
    const returnPercent = costBasisMinor === 0 ? 0 : (unrealizedChangeMinor / costBasisMinor) * 100;
    const ageDays = daysBetween(holding.priceAsOf, asOf);
    const freshness = ageDays <= 7 ? 'fresh' as const : 'stale' as const;
    const tone = unrealizedChangeMinor > 0 ? 'gain' as const : unrealizedChangeMinor < 0 ? 'loss' as const : 'flat' as const;
    const signed = unrealizedChangeMinor > 0 ? '+' : '';

    return Object.freeze({
      holdingId: holding.id,
      ticker: holding.ticker,
      costBasisMinor,
      marketValueMinor: holding.marketValueMinor,
      unrealizedChangeMinor,
      returnPercent,
      freshness,
      tone,
      reason: `평가손익 ${signed}${unrealizedChangeMinor.toLocaleString('ko-KR')}원 (${returnPercent.toFixed(1)}%), 가격 기준일 ${holding.priceAsOf} · ${ageDays}일 경과. 기록된 평가값을 요약하며 매수·매도 추천이 아닙니다.`,
    });
  });
}

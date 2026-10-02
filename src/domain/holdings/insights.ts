import type { Holding } from './types';

export interface HoldingInsight {
  readonly holdingId: Holding['id'];
  readonly ticker: string;
  readonly costBasisMinor: number;
  readonly marketValueMinor: number;
  readonly unrealizedGainMinor: number;
  readonly returnPercent: number;
  readonly direction: 'gain' | 'loss' | 'flat';
  readonly reason: string;
}

export function buildHoldingInsight(holding: Holding): HoldingInsight {
  const quantity = Number(holding.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) throw new TypeError('Holding quantity must be a non-negative number.');
  const costBasisMinor = Math.round(quantity * holding.avgCostMinor);
  const unrealizedGainMinor = holding.marketValueMinor - costBasisMinor;
  const returnPercent = costBasisMinor === 0 ? 0 : (unrealizedGainMinor / costBasisMinor) * 100;
  const direction = unrealizedGainMinor > 0 ? 'gain' : unrealizedGainMinor < 0 ? 'loss' : 'flat';
  const absPercent = Math.abs(returnPercent).toFixed(1);
  const reason = direction === 'gain'
    ? `현재 시장가치가 평균 매입원가 기준 원가보다 ${absPercent}% 높습니다.`
    : direction === 'loss'
      ? `현재 시장가치가 평균 매입원가 기준 원가보다 ${absPercent}% 낮습니다.`
      : '현재 시장가치와 평균 매입원가 기준 원가가 같습니다.';

  return Object.freeze({
    holdingId: holding.id,
    ticker: holding.ticker,
    costBasisMinor,
    marketValueMinor: holding.marketValueMinor,
    unrealizedGainMinor,
    returnPercent,
    direction,
    reason,
  });
}

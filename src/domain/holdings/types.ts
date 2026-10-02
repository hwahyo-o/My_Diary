import type { EntityMeta, ISODate, UUID } from '../shared/types';

export interface Holding extends EntityMeta {
  readonly accountId: UUID;
  readonly ticker: string;
  readonly quantity: string;
  readonly avgCostMinor: number;
  readonly marketValueMinor: number;
  readonly priceAsOf: ISODate;
}

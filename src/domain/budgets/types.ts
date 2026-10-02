import type { EntityMeta, ISODate } from '../shared/types';

export interface Budget extends EntityMeta {
  readonly month: ISODate;
  readonly limitMinor: number;
  readonly alertPercents: readonly number[];
}

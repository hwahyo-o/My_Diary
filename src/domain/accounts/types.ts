import type { EntityMeta } from '../shared/types';

export type AccountKind = 'checking' | 'savings' | 'cash' | 'credit' | 'loan' | 'brokerage';
export type AccountPurpose = 'daily' | 'fixed-cost' | 'saving' | 'emergency' | 'investment' | 'other';

export interface Account extends EntityMeta {
  readonly name: string;
  readonly kind: AccountKind;
  readonly purpose?: AccountPurpose;
  readonly includeNetWorth: boolean;
}

import type { EntityMeta, UUID } from '../shared/types';

export interface Loan extends EntityMeta {
  readonly accountId: UUID;
  readonly remainingPrincipalMinor: number;
  readonly annualInterestRate: number;
}

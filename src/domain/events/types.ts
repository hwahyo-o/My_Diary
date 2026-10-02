import type { EntityMeta, UUID } from '../shared/types';

export type EventAction = 'create' | 'update' | 'delete' | 'restore' | 'merge';

export interface DomainEvent extends EntityMeta {
  readonly recordId: UUID;
  readonly recordType: string;
  readonly action: EventAction;
  readonly deviceId: UUID;
  readonly deviceSeq: number;
  readonly encryptedPatch?: string;
}

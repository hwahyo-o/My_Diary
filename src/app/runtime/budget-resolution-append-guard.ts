import type { ImmutableBudgetResolutionPlan } from './budget-conflict-immutable-resolution-plan';
import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';

/** Validate a freshly encrypted append operation before allowing repository CAS. */
export function assertAppendOnlyBudgetResolution(
  plan: ImmutableBudgetResolutionPlan,
  record: StoredEncryptedRecord,
  event: StoredEvent,
  currentLocalRevision: number,
  currentCloudRevision: number,
): void {
  if (plan.mode !== 'append-new-budget' ||
      !Number.isSafeInteger(plan.chosenLimitMinor) || plan.chosenLimitMinor < 0 ||
      !Number.isSafeInteger(currentLocalRevision) || !Number.isSafeInteger(currentCloudRevision) ||
      currentLocalRevision !== plan.expectedLocalRevision ||
      currentCloudRevision !== plan.expectedCloudRevision) {
    throw new Error('Budget resolution revisions or plan are invalid; refresh.');
  }
  if (record.recordId === plan.sourceRecordId ||
      !record.recordId || record.recordType !== 'budget' ||
      record.recordVersion !== 1 ||
      event.recordId !== record.recordId ||
      event.recordType !== 'budget' || event.action !== 'create' ||
      !event.eventId || record.encryptedPayload.length === 0 ||
      event.encryptedPatch.length === 0) {
    throw new Error('Budget resolution must append a separate encrypted record and creation event.');
  }
}

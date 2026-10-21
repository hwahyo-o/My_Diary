import type { EncryptedRepository, StoredEncryptedRecord, StoredEvent } from '../../storage/repository';
import type { ImmutableBudgetResolutionPlan } from './budget-conflict-immutable-resolution-plan';
import { assertAppendOnlyBudgetResolution } from './budget-resolution-append-guard';

/**
 * Append an already-encrypted resolution candidate atomically.
 * This does not clear cloudConflict, overwrite a source record or upload.
 * The caller must reverify cloud HEAD and snapshots before invoking this step.
 */
export async function commitEncryptedBudgetResolutionAppend(
  repository: EncryptedRepository,
  vaultId: string,
  plan: ImmutableBudgetResolutionPlan,
  record: StoredEncryptedRecord,
  event: StoredEvent,
  verifiedCloudRevision: number,
): Promise<number> {
  const currentRevision = await repository.getRevision(vaultId);
  assertAppendOnlyBudgetResolution(plan, record, event, currentRevision, verifiedCloudRevision);
  const existing = await repository.listAllRecords();
  if (existing.some((item) => item.recordId === record.recordId)) {
    throw new Error('Budget resolution target record already exists.');
  }
  // commitRecordEvent performs the revision CAS inside the same IndexedDB transaction.
  // records.add and events.add reject duplicate identities inside the transaction.
  return repository.commitRecordEvent(vaultId, record, event, plan.expectedLocalRevision, true);
}

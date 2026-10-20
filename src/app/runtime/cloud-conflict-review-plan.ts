import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';

export interface CloudConflictReviewPlan {
  readonly recordIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly requiresManualReview: boolean;
}
function identicalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
function identicalRecord(a: StoredEncryptedRecord, b: StoredEncryptedRecord): boolean {
  return a.recordId === b.recordId && a.recordType === b.recordType
    && a.recordVersion === b.recordVersion && a.updatedAt === b.updatedAt
    && identicalBytes(a.encryptedPayload, b.encryptedPayload);
}
function identicalEvent(a: StoredEvent, b: StoredEvent): boolean {
  return a.eventId === b.eventId && a.recordId === b.recordId
    && a.recordType === b.recordType && a.action === b.action
    && a.deviceId === b.deviceId && a.deviceSeq === b.deviceSeq
    && a.createdAt === b.createdAt && identicalBytes(a.encryptedPatch, b.encryptedPatch);
}

/** Identify conflicts without choosing a winner, decrypting, writing or uploading. */
export function planEncryptedCloudConflictReview(
  localRecords: readonly StoredEncryptedRecord[],
  remoteRecords: readonly StoredEncryptedRecord[],
  localEvents: readonly StoredEvent[],
  remoteEvents: readonly StoredEvent[],
): CloudConflictReviewPlan {
  const localRecordMap = new Map(localRecords.map((item) => [item.recordId, item]));
  const localEventMap = new Map(localEvents.map((item) => [item.eventId, item]));
  const recordIds = [...new Set(remoteRecords.filter((item) => {
    const local = localRecordMap.get(item.recordId);
    return local !== undefined && !identicalRecord(local, item);
  }).map((item) => item.recordId))].sort();
  const eventIds = [...new Set(remoteEvents.filter((item) => {
    const local = localEventMap.get(item.eventId);
    return local !== undefined && !identicalEvent(local, item);
  }).map((item) => item.eventId))].sort();
  return { recordIds, eventIds, requiresManualReview: recordIds.length > 0 || eventIds.length > 0 };
}

import { expect, it } from 'vitest';
import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';
import { reconcileEncryptedCollections } from './browser-runtime';

it('does not hide a diverging event conflict when merging two encrypted budget histories in reverse order', () => {
  const record: StoredEncryptedRecord = {
    recordId: 'budget-shared', recordType: 'budget', recordVersion: 1,
    updatedAt: '2026-10-19T08:00:00.000Z', encryptedPayload: new Uint8Array([1, 2]),
  };
  const local: StoredEvent = {
    eventId: 'event-shared', recordId: record.recordId, recordType: 'budget',
    action: 'create', deviceId: 'device-a', deviceSeq: 1,
    createdAt: record.updatedAt, encryptedPatch: new Uint8Array([3, 4]),
  };
  const remote: StoredEvent = { ...local, encryptedPatch: new Uint8Array([9, 8]) };
  const forward = reconcileEncryptedCollections([record], [record], [local], [remote]);
  const reverse = reconcileEncryptedCollections([record], [record], [remote], [local]);
  expect(forward.hardConflicts).toBe(1);
  expect(reverse.hardConflicts).toBe(1);
  expect(forward.events).toEqual([local]);
  expect(reverse.events).toEqual([remote]);
  expect(local.encryptedPatch).toEqual(new Uint8Array([3, 4]));
  expect(remote.encryptedPatch).toEqual(new Uint8Array([9, 8]));
  // The conflict count, rather than either candidate chosen by merge ordering,
  // must prevent the caller from applying or uploading the merged collection.
});

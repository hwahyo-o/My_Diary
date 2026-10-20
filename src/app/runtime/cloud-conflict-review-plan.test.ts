import { expect, it } from 'vitest';
import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';
import { planEncryptedCloudConflictReview } from './cloud-conflict-review-plan';

const record = (id: string, byte: number): StoredEncryptedRecord => ({
  recordId: id, recordType: 'budget', recordVersion: 1,
  updatedAt: '2026-10-20T05:00:00.000Z', encryptedPayload: new Uint8Array([byte]),
});
const event = (id: string, byte: number): StoredEvent => ({
  eventId: id, recordId: 'budget', recordType: 'budget', action: 'update',
  deviceId: 'device-a', deviceSeq: 1, createdAt: '2026-10-20T05:00:00.000Z',
  encryptedPatch: new Uint8Array([byte]),
});
it('lists both differing record and event identities without resolving either', () => {
  const a = record('shared', 1);
  const b = record('shared', 2);
  const left = event('shared-event', 5);
  const right = event('shared-event', 7);
  const snapshot = structuredClone([a, left, b, right]);
  expect(planEncryptedCloudConflictReview([a], [b], [left], [right])).toEqual({
    recordIds: ['shared'], eventIds: ['shared-event'], requiresManualReview: true,
  });
  expect([a, left, b, right].map((item) => ({ ...item, bytes: Array.from('encryptedPayload' in item ? item.encryptedPayload : item.encryptedPatch) })))
    .toEqual(snapshot.map((item) => ({ ...item, bytes: Array.from('encryptedPayload' in item ? item.encryptedPayload : item.encryptedPatch) })));
});
it('does not treat distinct IDs or identical payloads as record conflicts', () => {
  expect(planEncryptedCloudConflictReview(
    [record('local', 1), record('same', 4)],
    [record('remote', 2), record('same', 4)], [], [],
  )).toEqual({ recordIds: [], eventIds: [], requiresManualReview: false });
});

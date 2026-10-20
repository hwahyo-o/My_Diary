import { expect, it } from 'vitest';
import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';
import { reconcileEncryptedCollections } from './browser-runtime';

it('keeps a hard budget record conflict detectable despite additional independent history', () => {
  const base: StoredEncryptedRecord = {
    recordId: 'budget-conflicted', recordType: 'budget', recordVersion: 2,
    updatedAt: '2026-10-20T01:00:00.000Z', encryptedPayload: new Uint8Array([1, 2]),
  };
  const divergent: StoredEncryptedRecord = { ...base, encryptedPayload: new Uint8Array([9, 8]) };
  const independent: StoredEncryptedRecord = {
    recordId: 'budget-independent', recordType: 'budget', recordVersion: 1,
    updatedAt: base.updatedAt, encryptedPayload: new Uint8Array([5]),
  };
  const event: StoredEvent = {
    eventId: 'event-independent', recordId: independent.recordId, recordType: 'budget',
    action: 'create', deviceId: 'other-device', deviceSeq: 1,
    createdAt: independent.updatedAt, encryptedPatch: new Uint8Array([7]),
  };
  const merged = reconcileEncryptedCollections([base], [divergent, independent], [], [event]);
  expect(merged.hardConflicts).toBeGreaterThan(0);
  expect(merged.records).toContainEqual(base);
  expect(merged.records).toContainEqual(independent);
  expect(merged.events).toContainEqual(event);
  expect(divergent.encryptedPayload).toEqual(new Uint8Array([9, 8]));
  // The caller must not apply/upload the resulting collection when hardConflicts > 0.
});

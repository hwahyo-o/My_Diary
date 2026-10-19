import { expect, it } from 'vitest';
import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';
import { reconcileEncryptedCollections } from './browser-runtime';

it('retains both encrypted same-month budget edits from separate devices without silently overwriting either record', () => {
  const local: StoredEncryptedRecord = {
    recordId: 'device-a-budget-october',
    recordType: 'budget',
    updatedAt: '2026-10-19T12:00:00.000Z',
    recordVersion: 1,
    encryptedPayload: new Uint8Array([1, 2, 3]),
  };
  const remote: StoredEncryptedRecord = {
    recordId: 'device-b-budget-october',
    recordType: 'budget',
    updatedAt: '2026-10-19T12:00:00.000Z',
    recordVersion: 1,
    encryptedPayload: new Uint8Array([8, 9, 10]),
  };
  const makeEvent = (id: string, recordId: string, deviceId: string): StoredEvent => ({
    eventId: id,
    recordId,
    recordType: 'budget',
    action: 'create',
    deviceId,
    deviceSeq: 1,
    createdAt: '2026-10-19T12:00:00.000Z',
    encryptedPatch: new Uint8Array([4, 5]),
  });
  const localEvent = makeEvent('edit-a', local.recordId, 'device-a');
  const remoteEvent = makeEvent('edit-b', remote.recordId, 'device-b');
  const result = reconcileEncryptedCollections([local], [remote], [localEvent], [remoteEvent]);
  expect(result.hardConflicts).toBe(0);
  expect(result.records).toHaveLength(2);
  expect(result.records).toEqual(expect.arrayContaining([local, remote]));
  expect(result.events).toEqual(expect.arrayContaining([localEvent, remoteEvent]));
  // Distinct budget records are preserved, but this does not resolve
  // which simultaneous same-month limit should be presented to the user.
});

it('fails closed on divergent encrypted edits to the same budget record across devices', () => {
  const local: StoredEncryptedRecord = {
    recordId: 'shared-october-budget',
    recordType: 'budget',
    updatedAt: '2026-10-19T12:00:00.000Z',
    recordVersion: 2,
    encryptedPayload: new Uint8Array([1, 2, 3]),
  };
  const remote: StoredEncryptedRecord = {
    ...local,
    updatedAt: '2026-10-19T12:01:00.000Z',
    encryptedPayload: new Uint8Array([8, 9, 10]),
  };
  const localEvent: StoredEvent = {
    eventId: 'budget-update-device-a',
    recordId: local.recordId,
    recordType: 'budget',
    action: 'update',
    deviceId: 'device-a',
    deviceSeq: 2,
    createdAt: local.updatedAt,
    encryptedPatch: new Uint8Array([4]),
  };
  const remoteEvent: StoredEvent = {
    ...localEvent,
    eventId: 'budget-update-device-b',
    deviceId: 'device-b',
    createdAt: remote.updatedAt,
    encryptedPatch: new Uint8Array([5]),
  };

  const result = reconcileEncryptedCollections([local], [remote], [localEvent], [remoteEvent]);

  expect(result.hardConflicts).toBe(1);
  // A differing record ID must not be used to conceal a true same-record conflict.
  // The caller must reject applying/uploading this conflicted merged collection.
  expect(result.records).toEqual([local]);
  expect(result.events).toEqual(expect.arrayContaining([localEvent, remoteEvent]));
  expect(local.encryptedPayload).toEqual(new Uint8Array([1, 2, 3]));
  expect(remote.encryptedPayload).toEqual(new Uint8Array([8, 9, 10]));
});

import { describe, expect, it } from 'vitest';
import { reconcileEncryptedCollections } from './browser-runtime';
import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';

const bytes = (...values: number[]) => new Uint8Array(values);
function record(id: string, payload: Uint8Array = bytes(1), version = 1): StoredEncryptedRecord {
  return {
    recordId: id,
    recordType: 'transaction',
    updatedAt: '2026-10-15T00:00:00.000Z',
    recordVersion: version,
    encryptedPayload: payload,
  };
}
function event(id: string, recordId: string, patch: Uint8Array = bytes(4)): StoredEvent {
  return {
    eventId: id,
    recordId,
    recordType: 'transaction',
    action: 'create',
    deviceId: 'device-A',
    deviceSeq: 1,
    createdAt: '2026-10-15T00:00:00.000Z',
    encryptedPatch: patch,
  };
}

describe('encrypted cloud reconciliation safety', () => {
  it('merges distinct offline records from two devices with their events intact', () => {
    const local = record('phone-offline');
    const cloud = record('desktop-online', bytes(2));
    const localEvent = event('phone-event', local.recordId);
    const remoteEvent = event('desktop-event', cloud.recordId, bytes(5));
    const result = reconcileEncryptedCollections([local], [cloud], [localEvent], [remoteEvent]);
    expect(result.hardConflicts).toBe(0);
    expect(result.records).toHaveLength(2);
    expect(result.events).toHaveLength(2);
    expect(result.records).toEqual(expect.arrayContaining([local, cloud]));
    expect(result.events).toEqual(expect.arrayContaining([localEvent, remoteEvent]));
  });

  it('treats identical replayed records and events as idempotent rather than duplicating them', () => {
    const local = record('existing', bytes(10, 20));
    const replay = record('existing', bytes(10, 20));
    const localEvent = event('same-event', 'existing', bytes(11));
    const replayEvent = event('same-event', 'existing', bytes(11));
    const result = reconcileEncryptedCollections([local], [replay], [localEvent], [replayEvent]);
    expect(result.hardConflicts).toBe(0);
    expect(result.records).toHaveLength(1);
    expect(result.events).toHaveLength(1);
  });

  it('flags divergent encrypted versions of the same transaction and keeps the local version', () => {
    const local = record('same-transaction', bytes(1, 2), 2);
    const cloud = record('same-transaction', bytes(9, 9), 2);
    const result = reconcileEncryptedCollections([local], [cloud], [], []);
    expect(result.hardConflicts).toBe(1);
    expect(result.records).toEqual([local]);
    expect(result.records[0]?.encryptedPayload).toEqual(bytes(1, 2));
  });

  it('detects a conflicting event replay instead of silently replacing its encrypted patch', () => {
    const local = event('shared-event-id', 'tx', bytes(1));
    const remote = event('shared-event-id', 'tx', bytes(2));
    const result = reconcileEncryptedCollections([], [], [local], [remote]);
    expect(result.hardConflicts).toBe(1);
    expect(result.events).toEqual([local]);
  });

  it('never drops a local-only transaction during a cloud-only update', () => {
    const localOnly = record('unsynced-phone-transaction');
    const shared = record('already-synced');
    const cloudOnly = record('new-cloud-transaction');
    const result = reconcileEncryptedCollections([localOnly, shared], [shared, cloudOnly], [], []);
    expect(result.hardConflicts).toBe(0);
    expect(result.records.map((item) => item.recordId).sort()).toEqual([
      'already-synced', 'new-cloud-transaction', 'unsynced-phone-transaction',
    ]);
  });
});

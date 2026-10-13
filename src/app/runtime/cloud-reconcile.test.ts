import { describe, expect, it } from 'vitest';
import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';
import { reconcileEncryptedCollections } from './browser-runtime';

function record(id: string, payload: number[]): StoredEncryptedRecord {
  return {
    recordId: id,
    recordType: 'transaction',
    updatedAt: '2026-10-13T08:00:00.000Z',
    recordVersion: 1,
    encryptedPayload: new Uint8Array(payload),
  };
}

function event(id: string, recordId: string, patch: number[]): StoredEvent {
  return {
    eventId: id,
    recordId,
    recordType: 'transaction',
    action: 'create',
    deviceId: 'device-a',
    deviceSeq: 1,
    createdAt: '2026-10-13T08:00:00.000Z',
    encryptedPatch: new Uint8Array(patch),
  };
}

describe('encrypted cloud reconciliation', () => {
  it('merges independent records and events from two offline devices', () => {
    const result = reconcileEncryptedCollections(
      [record('local-only', [1])],
      [record('cloud-only', [2])],
      [event('event-local', 'local-only', [3])],
      [event('event-cloud', 'cloud-only', [4])],
    );

    expect(result.hardConflicts).toBe(0);
    expect(result.records.map((item) => item.recordId).sort()).toEqual(['cloud-only', 'local-only']);
    expect(result.events.map((item) => item.eventId).sort()).toEqual(['event-cloud', 'event-local']);
  });

  it('deduplicates identical shared records and events', () => {
    const sharedRecord = record('shared', [1, 2, 3]);
    const sharedEvent = event('event-shared', 'shared', [4, 5, 6]);

    const result = reconcileEncryptedCollections(
      [sharedRecord],
      [sharedRecord],
      [sharedEvent],
      [sharedEvent],
    );

    expect(result.hardConflicts).toBe(0);
    expect(result.records).toHaveLength(1);
    expect(result.events).toHaveLength(1);
  });

  it('refuses overlapping edits to the same encrypted record', () => {
    const result = reconcileEncryptedCollections(
      [record('same-record', [1])],
      [record('same-record', [9])],
      [],
      [],
    );

    expect(result.hardConflicts).toBe(1);
  });
});

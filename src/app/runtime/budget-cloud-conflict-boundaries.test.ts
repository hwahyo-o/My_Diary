import { describe, expect, it } from 'vitest';
import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';
import { reconcileEncryptedCollections } from './browser-runtime';

const record = (id: string, bytes: number[]): StoredEncryptedRecord => ({
  recordId: id, recordType: 'budget', recordVersion: 1,
  updatedAt: '2026-10-19T07:00:00.000Z',
  encryptedPayload: new Uint8Array(bytes),
});
const event = (id: string, recordId: string): StoredEvent => ({
  eventId: id, recordId, recordType: 'budget',
  action: 'create', deviceId: 'device-a', deviceSeq: 1,
  createdAt: '2026-10-19T07:00:00.000Z',
  encryptedPatch: new Uint8Array([9]),
});

describe('encrypted budget cloud merge conflict boundaries', () => {
  it('preserves distinct budget identities as independent encrypted records', () => {
    const local = record('local-budget', [1]);
    const remote = record('remote-budget', [2]);
    const merged = reconcileEncryptedCollections(
      [local], [remote], [event('local-event', local.recordId)], [event('remote-event', remote.recordId)],
    );
    expect(merged.hardConflicts).toBe(0);
    expect(merged.records).toEqual(expect.arrayContaining([local, remote]));
    expect(merged.events).toHaveLength(2);
    // The encrypted merge cannot infer whether these are sequential or concurrent monthly edits.
  });

  it('flags divergent ciphertext for the same budget ID rather than choosing either value', () => {
    const local = record('shared-budget', [1, 2]);
    const remote = record('shared-budget', [3, 4]);
    const merged = reconcileEncryptedCollections([local], [remote], [], []);
    expect(merged.hardConflicts).toBe(1);
    expect(merged.records).toEqual([local]);
    expect(remote.encryptedPayload).toEqual(new Uint8Array([3, 4]));
  });

  it('flags reused event identity with diverging encrypted patches even if records match', () => {
    const shared = record('shared-budget', [1]);
    const localEvent = event('shared-event', shared.recordId);
    const remoteEvent = { ...localEvent, encryptedPatch: new Uint8Array([8]) };
    const merged = reconcileEncryptedCollections([shared], [shared], [localEvent], [remoteEvent]);
    expect(merged.hardConflicts).toBe(1);
    expect(merged.events).toEqual([localEvent]);
  });
});

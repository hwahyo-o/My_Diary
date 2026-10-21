import { expect, it } from 'vitest';
import { reconcileEncryptedCollections } from './browser-runtime';
import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';

const record = (id: string, byte: number): StoredEncryptedRecord => ({
  recordId: id, recordType: 'budget', recordVersion: 1,
  updatedAt: '2026-10-21T00:00:00.000Z',
  encryptedPayload: new Uint8Array([byte]),
});
const event = (id: string, recordId: string): StoredEvent => ({
  eventId: id, recordId, recordType: 'budget', action: 'create',
  deviceId: 'synthetic', deviceSeq: 1, createdAt: '2026-10-21T00:00:00.000Z',
  encryptedPatch: new Uint8Array([1]),
});

it('an appended resolution budget cannot erase the original same-ID ciphertext collision', () => {
  const local = [record('original', 1), record('resolution', 3)];
  const remote = [record('original', 2), record('resolution', 3)];
  const localEvents = [event('local-event', 'original'), event('resolution-event', 'resolution')];
  const remoteEvents = [event('remote-event', 'original'), event('resolution-event', 'resolution')];
  const result = reconcileEncryptedCollections(local, remote, localEvents, remoteEvents);
  expect(result.hardConflicts).toBe(1);
  expect(result.records.some((r) => r.recordId === 'resolution')).toBe(true);
  expect(local[0]!.encryptedPayload[0]).toBe(1);
  expect(remote[0]!.encryptedPayload[0]).toBe(2);
});

it('a resolved pair of identical encrypted records has no hard conflict', () => {
  const shared = record('original', 1);
  const result = reconcileEncryptedCollections([shared], [{ ...shared, encryptedPayload: new Uint8Array([1]) }], [], []);
  expect(result.hardConflicts).toBe(0);
});

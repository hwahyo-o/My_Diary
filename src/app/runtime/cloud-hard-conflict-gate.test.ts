import { expect, it } from 'vitest';
import type { StoredEncryptedRecord } from '../../storage/repository';
import { reconcileEncryptedCollections } from './browser-runtime';
import { assertNoCloudHardConflicts } from './cloud-hard-conflict-gate';

it('blocks a divergent encrypted cloud record before any apply/upload action', () => {
  const record: StoredEncryptedRecord = {
    recordId: 'same-budget', recordType: 'budget', recordVersion: 1,
    updatedAt: '2026-10-20T02:00:00.000Z', encryptedPayload: new Uint8Array([1]),
  };
  const other = { ...record, encryptedPayload: new Uint8Array([2]) };
  const result = reconcileEncryptedCollections([record], [other], [], []);
  const applyOrUpload = () => {
    assertNoCloudHardConflicts(result.hardConflicts);
    return 'applied';
  };
  expect(applyOrUpload).toThrow('manual resolution');
  expect(record.encryptedPayload).toEqual(new Uint8Array([1]));
  expect(other.encryptedPayload).toEqual(new Uint8Array([2]));
});

it('permits nonconflicting encrypted records and rejects invalid conflict counts', () => {
  expect(() => assertNoCloudHardConflicts(0)).not.toThrow();
  expect(() => assertNoCloudHardConflicts(-1)).toThrow();
  expect(() => assertNoCloudHardConflicts(Number.NaN)).toThrow();
});

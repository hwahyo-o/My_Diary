import { expect, it, vi } from 'vitest';
import type { StoredEncryptedRecord } from '../../storage/repository';
import { reconcileEncryptedCollections } from './browser-runtime';
import { assertNoCloudHardConflicts } from './cloud-hard-conflict-gate';

it('does not open a local replacement transaction after conflicting budget ciphertext is discovered', async () => {
  const local: StoredEncryptedRecord = {
    recordId: 'budget-shared', recordType: 'budget', recordVersion: 1,
    updatedAt: '2026-10-20T04:00:00.000Z', encryptedPayload: new Uint8Array([1]),
  };
  const remote = { ...local, encryptedPayload: new Uint8Array([2]) };
  const beginReplacement = vi.fn();
  const merged = reconcileEncryptedCollections([local], [remote], [], []);
  const attempt = async () => {
    assertNoCloudHardConflicts(merged.hardConflicts);
    await beginReplacement(merged.records);
  };
  await expect(attempt()).rejects.toThrow('manual resolution');
  expect(beginReplacement).not.toHaveBeenCalled();
  expect(local.encryptedPayload).toEqual(new Uint8Array([1]));
  expect(remote.encryptedPayload).toEqual(new Uint8Array([2]));
});

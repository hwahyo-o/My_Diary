import { expect, it, vi } from 'vitest';
import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';
import { reconcileEncryptedCollections } from './browser-runtime';
import { assertNoCloudHardConflicts } from './cloud-hard-conflict-gate';

const record = (id: string, bytes: number[]): StoredEncryptedRecord => ({
  recordId: id,
  recordType: 'budget',
  recordVersion: 1,
  updatedAt: '2026-10-20T02:00:00.000Z',
  encryptedPayload: new Uint8Array(bytes),
});
const event = (id: string, recordId: string): StoredEvent => ({
  eventId: id,
  recordId,
  recordType: 'budget',
  action: 'create',
  deviceId: 'device-a',
  deviceSeq: 1,
  createdAt: '2026-10-20T02:00:00.000Z',
  encryptedPatch: new Uint8Array([4]),
});

it('prevents both replacement and upload in a conflict-gated reconciliation transaction', async () => {
  const replaceVaultData = vi.fn().mockResolvedValue(undefined);
  const uploadCloudSnapshot = vi.fn().mockResolvedValue(undefined);
  const local = record('shared', [1]);
  const remote = record('shared', [9]);
  const extra = record('remote-only', [7]);
  const reconciled = reconcileEncryptedCollections(
    [local], [remote, extra], [], [event('new-event', extra.recordId)],
  );

  const apply = async () => {
    assertNoCloudHardConflicts(reconciled.hardConflicts);
    await replaceVaultData(reconciled.records);
    await uploadCloudSnapshot(reconciled.records);
  };
  await expect(apply()).rejects.toThrow('manual resolution');
  expect(replaceVaultData).not.toHaveBeenCalled();
  expect(uploadCloudSnapshot).not.toHaveBeenCalled();
  expect(local.encryptedPayload).toEqual(new Uint8Array([1]));
  expect(remote.encryptedPayload).toEqual(new Uint8Array([9]));
});

it('permits a conflict-free gate to apply and upload exactly once', async () => {
  const replaceVaultData = vi.fn().mockResolvedValue(undefined);
  const uploadCloudSnapshot = vi.fn().mockResolvedValue(undefined);
  const merged = reconcileEncryptedCollections(
    [record('local', [1])], [record('remote', [2])], [], [],
  );
  assertNoCloudHardConflicts(merged.hardConflicts);
  await replaceVaultData(merged.records);
  await uploadCloudSnapshot(merged.records);
  expect(replaceVaultData).toHaveBeenCalledTimes(1);
  expect(uploadCloudSnapshot).toHaveBeenCalledTimes(1);
});

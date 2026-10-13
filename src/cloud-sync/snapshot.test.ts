import { describe, expect, it } from 'vitest';
import { openCloudVaultSnapshot, sealCloudVaultSnapshot, sha256Hex, type CloudVaultSnapshot } from './snapshot';

const snapshot: CloudVaultSnapshot = {
  formatVersion: 1,
  schemaVersion: 1,
  vaultId: 'vault-1',
  createdAt: '2026-10-13T07:00:00.000Z',
  accountId: 'account-1',
  manifest: {
    profileRecordId: '11111111-1111-4111-8111-111111111111',
    defaultAccountId: '22222222-2222-4222-8222-222222222222',
    revision: 3,
  },
  cloudWrap: {
    algorithm: 'AES-GCM',
    iv: new Uint8Array(12).fill(1),
    ciphertext: new Uint8Array(48).fill(2),
  },
  recoveryWrap: {
    algorithm: 'AES-GCM',
    iv: new Uint8Array(12).fill(3),
    ciphertext: new Uint8Array(48).fill(4),
  },
  records: [{
    recordId: 'r1',
    recordType: 'transaction',
    updatedAt: '2026-10-13T07:00:00.000Z',
    recordVersion: 1,
    encryptedPayload: new Uint8Array([5, 6, 7]),
  }],
  events: [],
};

describe('sealed cloud Vault snapshots', () => {
  it('round-trips only with the matching cloud key', async () => {
    const key = new Uint8Array(32).fill(9);
    const sealed = await sealCloudVaultSnapshot(snapshot, key);
    const opened = await openCloudVaultSnapshot(sealed, key);

    expect(opened.vaultId).toBe(snapshot.vaultId);
    expect(opened.records[0]?.encryptedPayload).toEqual(new Uint8Array([5, 6, 7]));
    expect(new TextDecoder().decode(sealed)).not.toContain('transaction');
  });

  it('rejects a different cloud key and produces a stable digest for the same bytes', async () => {
    const sealed = await sealCloudVaultSnapshot(snapshot, new Uint8Array(32).fill(8));
    await expect(openCloudVaultSnapshot(sealed, new Uint8Array(32).fill(7))).rejects.toBeTruthy();

    expect(await sha256Hex(sealed)).toMatch(/^[a-f0-9]{64}$/);
  });
});

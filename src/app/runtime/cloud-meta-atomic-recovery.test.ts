import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from '../../storage/repository';

it('recovers acknowledgement metadata only at matching Vault revision', async () => {
  const db = await openVaultDatabase(`cloud-meta-cas-${crypto.randomUUID()}`);
  const repo = new EncryptedRepository(db);
  const vaultId = crypto.randomUUID();
  const key = 'test-cloud-ack';
  const record: StoredEncryptedRecord = {
    recordId: 'synthetic', recordType: 'budget', recordVersion: 1,
    updatedAt: '2026-10-21T05:00:00.000Z', encryptedPayload: new Uint8Array([1]),
  };
  const event: StoredEvent = {
    eventId: 'synthetic-event', recordId: 'synthetic', recordType: 'budget', action: 'create',
    deviceId: 'test-device', deviceSeq: 1, createdAt: record.updatedAt,
    encryptedPatch: new Uint8Array([2]),
  };
  try {
    await repo.putSecurityMeta(key, { cloudRevision: 3 });
    await repo.commitRecordEvent(vaultId, record, event, 0);
    await expect(repo.putSecurityMetaIfVaultRevision(vaultId, 0, key, { cloudRevision: 4 }))
      .rejects.toThrow('Vault revision changed');
    expect(await repo.getSecurityMeta<{ cloudRevision: number }>(key)).toEqual({ cloudRevision: 3 });
    await repo.putSecurityMetaIfVaultRevision(vaultId, 1, key, { cloudRevision: 4 });
    expect(await repo.getSecurityMeta<{ cloudRevision: number }>(key)).toEqual({ cloudRevision: 4 });
    expect((await repo.listAllRecords()).map((item) => item.recordId)).toEqual(['synthetic']);
  } finally { db.close(); }
});

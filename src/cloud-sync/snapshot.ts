import type { StoredEncryptedRecord, StoredEvent } from '../storage/repository';
import type { WrappedKeyEnvelope } from '../vault/key-wrap';

export interface CloudVaultManifest {
  readonly profileRecordId: string;
  readonly defaultAccountId: string;
  readonly revision: number;
}

export interface CloudVaultSnapshot {
  readonly formatVersion: 1;
  readonly schemaVersion: number;
  readonly vaultId: string;
  readonly createdAt: string;
  readonly accountId: string;
  readonly manifest: CloudVaultManifest;
  readonly cloudWrap: WrappedKeyEnvelope;
  readonly recoveryWrap: WrappedKeyEnvelope;
  readonly records: readonly StoredEncryptedRecord[];
  readonly events: readonly StoredEvent[];
}

interface JsonWrappedKeyEnvelope {
  readonly algorithm: 'AES-GCM';
  readonly iv: number[];
  readonly ciphertext: number[];
}

interface JsonRecord extends Omit<StoredEncryptedRecord, 'encryptedPayload'> {
  readonly encryptedPayload: number[];
}

interface JsonEvent extends Omit<StoredEvent, 'encryptedPatch'> {
  readonly encryptedPatch: number[];
}

interface JsonCloudVaultSnapshot {
  readonly formatVersion: 1;
  readonly schemaVersion: number;
  readonly vaultId: string;
  readonly createdAt: string;
  readonly accountId: string;
  readonly manifest: CloudVaultManifest;
  readonly cloudWrap: JsonWrappedKeyEnvelope;
  readonly recoveryWrap: JsonWrappedKeyEnvelope;
  readonly records: readonly JsonRecord[];
  readonly events: readonly JsonEvent[];
}

function serializeWrap(envelope: WrappedKeyEnvelope): JsonWrappedKeyEnvelope {
  return {
    algorithm: envelope.algorithm,
    iv: [...envelope.iv],
    ciphertext: [...envelope.ciphertext],
  };
}

function parseWrap(envelope: JsonWrappedKeyEnvelope): WrappedKeyEnvelope {
  return {
    algorithm: envelope.algorithm,
    iv: new Uint8Array(envelope.iv),
    ciphertext: new Uint8Array(envelope.ciphertext),
  };
}

export function encodeCloudVaultSnapshot(snapshot: CloudVaultSnapshot): Uint8Array {
  const json: JsonCloudVaultSnapshot = {
    ...snapshot,
    cloudWrap: serializeWrap(snapshot.cloudWrap),
    recoveryWrap: serializeWrap(snapshot.recoveryWrap),
    records: snapshot.records.map((record) => ({
      ...record,
      encryptedPayload: [...record.encryptedPayload],
    })),
    events: snapshot.events.map((event) => ({
      ...event,
      encryptedPatch: [...event.encryptedPatch],
    })),
  };
  return new TextEncoder().encode(JSON.stringify(json));
}

export function decodeCloudVaultSnapshot(bytes: Uint8Array): CloudVaultSnapshot {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as JsonCloudVaultSnapshot;
  if (
    parsed.formatVersion !== 1
    || !Number.isInteger(parsed.schemaVersion)
    || parsed.schemaVersion < 1
    || typeof parsed.vaultId !== 'string'
    || typeof parsed.accountId !== 'string'
    || typeof parsed.createdAt !== 'string'
    || !parsed.manifest
    || !Array.isArray(parsed.records)
    || !Array.isArray(parsed.events)
  ) {
    throw new TypeError('Cloud Vault snapshot is invalid.');
  }

  return {
    ...parsed,
    cloudWrap: parseWrap(parsed.cloudWrap),
    recoveryWrap: parseWrap(parsed.recoveryWrap),
    records: parsed.records.map((record) => ({
      ...record,
      encryptedPayload: new Uint8Array(record.encryptedPayload),
    })),
    events: parsed.events.map((event) => ({
      ...event,
      encryptedPatch: new Uint8Array(event.encryptedPatch),
    })),
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}


interface SealedCloudSnapshot {
  readonly format: 'my-diary-cloud-snapshot-v1';
  readonly iv: number[];
  readonly ciphertext: number[];
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importCloudSnapshotKey(rawKey: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  if (rawKey.length !== 32) throw new TypeError('Cloud snapshot key must be 32 bytes.');
  return crypto.subtle.importKey('raw', toArrayBuffer(rawKey), 'AES-GCM', false, usage);
}

export async function sealCloudVaultSnapshot(snapshot: CloudVaultSnapshot, cloudKek: Uint8Array): Promise<Uint8Array> {
  const key = await importCloudSnapshotKey(cloudKek, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encodeCloudVaultSnapshot(snapshot);
  try {
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: new TextEncoder().encode('my-diary/cloud-snapshot/v1'),
        tagLength: 128,
      },
      key,
      toArrayBuffer(plaintext),
    ));
    const sealed: SealedCloudSnapshot = {
      format: 'my-diary-cloud-snapshot-v1',
      iv: [...iv],
      ciphertext: [...ciphertext],
    };
    return new TextEncoder().encode(JSON.stringify(sealed));
  } finally {
    plaintext.fill(0);
  }
}

export async function openCloudVaultSnapshot(bytes: Uint8Array, cloudKek: Uint8Array): Promise<CloudVaultSnapshot> {
  const sealed = JSON.parse(new TextDecoder().decode(bytes)) as SealedCloudSnapshot;
  if (
    sealed.format !== 'my-diary-cloud-snapshot-v1'
    || !Array.isArray(sealed.iv)
    || sealed.iv.length !== 12
    || !Array.isArray(sealed.ciphertext)
  ) {
    throw new TypeError('Sealed cloud snapshot is invalid.');
  }

  const key = await importCloudSnapshotKey(cloudKek, ['decrypt']);
  const plaintext = new Uint8Array(await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(new Uint8Array(sealed.iv)),
      additionalData: new TextEncoder().encode('my-diary/cloud-snapshot/v1'),
      tagLength: 128,
    },
    key,
    toArrayBuffer(new Uint8Array(sealed.ciphertext)),
  ));
  try {
    return decodeCloudVaultSnapshot(plaintext);
  } finally {
    plaintext.fill(0);
  }
}

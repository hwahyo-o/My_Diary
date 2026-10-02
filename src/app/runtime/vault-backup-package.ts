import type { StoredEncryptedRecord, StoredEvent } from '../../storage/repository';
import { unwrapVaultKey, type WrappedKeyEnvelope } from '../../vault/key-wrap';
import { deriveRecoveryKek } from '../../vault/recovery';
import { decryptRecord, encryptRecord, type EncryptedRecordEnvelope, type RecordAad } from '../../vault/record-crypto';

const MAGIC = 'FVAULT';
const FORMAT_VERSION = 1;
const MANIFEST_RECORD_ID = 'backup-manifest';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface EncodedEnvelope {
  readonly algorithm: 'AES-GCM';
  readonly iv: string;
  readonly ciphertext: string;
}

interface EncodedWrappedKey {
  readonly algorithm: 'AES-GCM';
  readonly iv: string;
  readonly ciphertext: string;
}

interface EncodedRecord {
  readonly recordId: string;
  readonly recordType: string;
  readonly updatedAt: string;
  readonly recordVersion: number;
  readonly encryptedPayload: string;
}

interface EncodedEvent {
  readonly eventId: string;
  readonly recordId: string;
  readonly recordType: string;
  readonly action: StoredEvent['action'];
  readonly deviceId: string;
  readonly deviceSeq: number;
  readonly createdAt: string;
  readonly encryptedPatch: string;
}

export interface VaultBackupManifest {
  readonly profileRecordId: string;
  readonly defaultAccountId: string;
  readonly revision: number;
}

interface UnsignedVaultPackage {
  readonly magic: typeof MAGIC;
  readonly formatVersion: typeof FORMAT_VERSION;
  readonly schemaVersion: number;
  readonly vaultId: string;
  readonly createdAt: string;
  readonly recoveryWrap: EncodedWrappedKey;
  readonly encryptedManifest: EncodedEnvelope;
  readonly records: readonly EncodedRecord[];
  readonly events: readonly EncodedEvent[];
}

interface SignedVaultPackage extends UnsignedVaultPackage {
  readonly integrity: {
    readonly sha256: string;
    readonly hmacSha256: string;
  };
}

export interface VerifiedVaultPackage {
  readonly schemaVersion: number;
  readonly vaultId: string;
  readonly createdAt: string;
  readonly manifest: VaultBackupManifest;
  readonly records: StoredEncryptedRecord[];
  readonly events: StoredEvent[];
  readonly vaultKey: Uint8Array;
  readonly recoveryWrap: WrappedKeyEnvelope;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new TypeError('Invalid base64url value.');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeEnvelope(envelope: EncryptedRecordEnvelope): EncodedEnvelope {
  return {
    algorithm: envelope.algorithm,
    iv: bytesToBase64Url(envelope.iv),
    ciphertext: bytesToBase64Url(envelope.ciphertext),
  };
}

function decodeEnvelope(envelope: EncodedEnvelope): EncryptedRecordEnvelope {
  if (envelope.algorithm !== 'AES-GCM') throw new TypeError('Unsupported package encryption algorithm.');
  return {
    algorithm: envelope.algorithm,
    iv: base64UrlToBytes(envelope.iv),
    ciphertext: base64UrlToBytes(envelope.ciphertext),
  };
}

function encodeWrappedKey(envelope: WrappedKeyEnvelope): EncodedWrappedKey {
  return encodeEnvelope(envelope);
}

function decodeWrappedKey(envelope: EncodedWrappedKey): WrappedKeyEnvelope {
  return decodeEnvelope(envelope);
}

function wrapAad(vaultId: string): Uint8Array {
  return textEncoder.encode(`my-diary/recovery-vault-wrap/v1/${vaultId}`);
}

function manifestAad(vaultId: string, schemaVersion: number): RecordAad {
  return {
    vaultId,
    recordId: MANIFEST_RECORD_ID,
    recordType: 'backup-manifest',
    schemaVersion,
    recordVersion: FORMAT_VERSION,
  };
}

async function deriveMacKey(recoveryKey: Uint8Array, vaultId: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', toArrayBuffer(recoveryKey), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(textEncoder.encode(vaultId)),
      info: toArrayBuffer(textEncoder.encode('my-diary/backup-mac/v1')),
    },
    baseKey,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign', 'verify'],
  );
}

async function digest(bytes: Uint8Array): Promise<string> {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))));
}

function encodeRecord(record: StoredEncryptedRecord): EncodedRecord {
  return { ...record, encryptedPayload: bytesToBase64Url(record.encryptedPayload) };
}

function decodeRecord(record: EncodedRecord): StoredEncryptedRecord {
  return { ...record, encryptedPayload: base64UrlToBytes(record.encryptedPayload) };
}

function encodeEvent(event: StoredEvent): EncodedEvent {
  return { ...event, encryptedPatch: bytesToBase64Url(event.encryptedPatch) };
}

function decodeEvent(event: EncodedEvent): StoredEvent {
  return { ...event, encryptedPatch: base64UrlToBytes(event.encryptedPatch) };
}

function parseSignedPackage(bytes: Uint8Array): SignedVaultPackage {
  if (bytes.byteLength > 50 * 1024 * 1024) throw new Error('Vault package exceeds the supported size limit.');
  let value: unknown;
  try {
    value = JSON.parse(textDecoder.decode(bytes));
  } catch {
    throw new Error('Vault package is not valid JSON.');
  }
  if (!value || typeof value !== 'object') throw new Error('Vault package has an invalid shape.');
  const packageValue = value as Partial<SignedVaultPackage>;
  if (packageValue.magic !== MAGIC || packageValue.formatVersion !== FORMAT_VERSION) {
    throw new Error('Unsupported Vault package format.');
  }
  if (!Number.isInteger(packageValue.schemaVersion) || !packageValue.vaultId || !packageValue.integrity) {
    throw new Error('Vault package header is incomplete.');
  }
  if (!Array.isArray(packageValue.records) || !Array.isArray(packageValue.events) || packageValue.records.length > 100_000 || packageValue.events.length > 500_000) {
    throw new Error('Vault package collection limits are invalid.');
  }
  return packageValue as SignedVaultPackage;
}

export async function createVaultPackage(input: {
  readonly schemaVersion: number;
  readonly vaultId: string;
  readonly createdAt: string;
  readonly recoveryKey: Uint8Array;
  readonly recoveryWrap: WrappedKeyEnvelope;
  readonly vaultKey: Uint8Array | CryptoKey;
  readonly manifest: VaultBackupManifest;
  readonly records: readonly StoredEncryptedRecord[];
  readonly events: readonly StoredEvent[];
}): Promise<Uint8Array> {
  const recoveryKey = input.recoveryKey.slice();
  try {
    const encryptedManifest = await encryptRecord(input.vaultKey, manifestAad(input.vaultId, input.schemaVersion), input.manifest);
    const unsigned: UnsignedVaultPackage = {
      magic: MAGIC,
      formatVersion: FORMAT_VERSION,
      schemaVersion: input.schemaVersion,
      vaultId: input.vaultId,
      createdAt: input.createdAt,
      recoveryWrap: encodeWrappedKey(input.recoveryWrap),
      encryptedManifest: encodeEnvelope(encryptedManifest),
      records: input.records.map(encodeRecord),
      events: input.events.map(encodeEvent),
    };
    const unsignedBytes = textEncoder.encode(JSON.stringify(unsigned));
    const macKey = await deriveMacKey(recoveryKey, input.vaultId);
    const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', macKey, toArrayBuffer(unsignedBytes)));
    const integrity = { sha256: await digest(unsignedBytes), hmacSha256: bytesToBase64Url(hmac) };
    return textEncoder.encode(JSON.stringify({ ...unsigned, integrity } satisfies SignedVaultPackage));
  } finally {
    recoveryKey.fill(0);
  }
}

export async function verifyVaultPackage(bytes: Uint8Array, recoveryKeyText: string): Promise<VerifiedVaultPackage> {
  const packageValue = parseSignedPackage(bytes);
  const { integrity, ...unsigned } = packageValue;
  const unsignedBytes = textEncoder.encode(JSON.stringify(unsigned));
  const expectedDigest = await digest(unsignedBytes);
  if (expectedDigest !== integrity.sha256) throw new Error('Vault package checksum verification failed.');

  const recoveryKey = base64UrlToBytes(recoveryKeyText);
  if (recoveryKey.length !== 32) throw new Error('RecoveryKey has an invalid length.');
  const macKey = await deriveMacKey(recoveryKey, packageValue.vaultId);
  const validMac = await crypto.subtle.verify(
    'HMAC',
    macKey,
    toArrayBuffer(base64UrlToBytes(integrity.hmacSha256)),
    toArrayBuffer(unsignedBytes),
  );
  if (!validMac) throw new Error('Vault package authentication failed.');

  const recoveryKek = await deriveRecoveryKek(recoveryKey, packageValue.vaultId);
  try {
    const recoveryWrap = decodeWrappedKey(packageValue.recoveryWrap);
    const vaultKey = await unwrapVaultKey(recoveryWrap, recoveryKek, wrapAad(packageValue.vaultId));
    const manifest = await decryptRecord<VaultBackupManifest>(
      vaultKey,
      manifestAad(packageValue.vaultId, packageValue.schemaVersion),
      decodeEnvelope(packageValue.encryptedManifest),
    );
    if (!manifest.profileRecordId || !manifest.defaultAccountId || !Number.isInteger(manifest.revision) || manifest.revision < 0) {
      vaultKey.fill(0);
      throw new Error('Vault package manifest is invalid.');
    }
    return {
      schemaVersion: packageValue.schemaVersion,
      vaultId: packageValue.vaultId,
      createdAt: packageValue.createdAt,
      manifest,
      records: packageValue.records.map(decodeRecord),
      events: packageValue.events.map(decodeEvent),
      vaultKey,
      recoveryWrap,
    };
  } finally {
    recoveryKey.fill(0);
    recoveryKek.fill(0);
  }
}

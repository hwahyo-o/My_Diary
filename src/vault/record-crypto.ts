export interface RecordAad {
  readonly vaultId: string;
  readonly recordId: string;
  readonly recordType: string;
  readonly schemaVersion: number;
  readonly recordVersion: number;
}

export interface EncryptedRecordEnvelope {
  readonly algorithm: 'AES-GCM';
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function encodeAad(aad: RecordAad): Uint8Array {
  return new TextEncoder().encode([
    aad.vaultId,
    aad.recordId,
    aad.recordType,
    String(aad.schemaVersion),
    String(aad.recordVersion),
  ].join('\u001f'));
}

async function importVaultKey(key: Uint8Array | CryptoKey, usage: KeyUsage[]): Promise<CryptoKey> {
  if (key instanceof CryptoKey) return key;
  if (key.length !== 32) throw new TypeError('VaultKey must be 32 bytes.');
  return crypto.subtle.importKey('raw', toArrayBuffer(key), { name: 'AES-GCM' }, false, usage);
}

export async function encryptRecord<T>(
  vaultKey: Uint8Array | CryptoKey,
  aad: RecordAad,
  plaintext: T,
): Promise<EncryptedRecordEnvelope> {
  const key = await importVaultKey(vaultKey, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encodeAad(aad);
  const encoded = new TextEncoder().encode(JSON.stringify(plaintext));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: toArrayBuffer(additionalData), tagLength: 128 },
    key,
    toArrayBuffer(encoded),
  );
  encoded.fill(0);
  return { algorithm: 'AES-GCM', iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function decryptRecord<T>(
  vaultKey: Uint8Array | CryptoKey,
  aad: RecordAad,
  envelope: EncryptedRecordEnvelope,
): Promise<T> {
  if (envelope.algorithm !== 'AES-GCM' || envelope.iv.length !== 12) {
    throw new TypeError('Invalid encrypted record envelope.');
  }
  const key = await importVaultKey(vaultKey, ['decrypt']);
  const additionalData = encodeAad(aad);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(envelope.iv), additionalData: toArrayBuffer(additionalData), tagLength: 128 },
    key,
    toArrayBuffer(envelope.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export interface WrappedKeyEnvelope {
  readonly algorithm: 'AES-GCM';
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importKek(rawKek: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  if (rawKek.length !== 32) throw new TypeError('KEK must be 32 bytes.');
  return crypto.subtle.importKey('raw', toArrayBuffer(rawKek), { name: 'AES-GCM' }, false, usage);
}

function algorithm(iv: Uint8Array, aad?: Uint8Array): AesGcmParams {
  return aad
    ? { name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aad), tagLength: 128 }
    : { name: 'AES-GCM', iv: toArrayBuffer(iv), tagLength: 128 };
}

export async function wrapVaultKey(
  vaultKey: Uint8Array,
  rawKek: Uint8Array,
  aad?: Uint8Array,
): Promise<WrappedKeyEnvelope> {
  if (vaultKey.length !== 32) throw new TypeError('VaultKey must be 32 bytes.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const kek = await importKek(rawKek, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt(algorithm(iv, aad), kek, toArrayBuffer(vaultKey));
  return { algorithm: 'AES-GCM', iv, ciphertext: new Uint8Array(encrypted) };
}

export async function unwrapVaultKey(
  envelope: WrappedKeyEnvelope,
  rawKek: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  if (envelope.algorithm !== 'AES-GCM' || envelope.iv.length !== 12) {
    throw new TypeError('Invalid wrapped key envelope.');
  }
  const kek = await importKek(rawKek, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt(
    algorithm(envelope.iv, aad),
    kek,
    toArrayBuffer(envelope.ciphertext),
  );
  const vaultKey = new Uint8Array(decrypted);
  if (vaultKey.length !== 32) throw new TypeError('Unwrapped VaultKey has an invalid length.');
  return vaultKey;
}

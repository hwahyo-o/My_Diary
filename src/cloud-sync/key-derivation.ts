function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveHkdf(
  rootKey: Uint8Array,
  salt: Uint8Array,
  info: string,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(rootKey),
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(new TextEncoder().encode(info)),
    },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

export async function deriveCloudAuthSecret(
  rootKey: Uint8Array,
  accountSalt: Uint8Array,
): Promise<Uint8Array> {
  return deriveHkdf(rootKey, accountSalt, 'my-diary/cloud-auth/v1');
}

export async function deriveCloudKek(
  rootKey: Uint8Array,
  unlockPepper: Uint8Array,
): Promise<Uint8Array> {
  return deriveHkdf(rootKey, unlockPepper, 'my-diary/cloud-vault-wrap/v1');
}

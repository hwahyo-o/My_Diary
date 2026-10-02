function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function deriveRecoveryKek(recoveryKey: Uint8Array, vaultId: string): Promise<Uint8Array> {
  if (recoveryKey.length !== 32) throw new TypeError('RecoveryKey must be 32 bytes.');
  if (!vaultId) throw new TypeError('vaultId is required.');

  const baseKey = await crypto.subtle.importKey('raw', toArrayBuffer(recoveryKey), 'HKDF', false, ['deriveBits']);
  const salt = new TextEncoder().encode(vaultId);
  const info = new TextEncoder().encode('my-diary/recovery-kek/v1');
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: toArrayBuffer(salt), info: toArrayBuffer(info) },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

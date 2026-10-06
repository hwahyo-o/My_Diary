function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export class VaultSession {
  #key: CryptoKey | null;

  private constructor(key: CryptoKey) {
    this.#key = key;
  }

  static async unlock(rawVaultKey: Uint8Array): Promise<VaultSession> {
    if (rawVaultKey.length !== 32) throw new TypeError('VaultKey must be 32 bytes.');
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(rawVaultKey),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      );
      return new VaultSession(key);
    } finally {
      rawVaultKey.fill(0);
    }
  }

  get isUnlocked(): boolean {
    return this.#key !== null;
  }

  withVaultKey<T>(fn: (key: CryptoKey) => T): T {
    const key = this.#key;
    if (!key) throw new Error('Vault session is locked.');
    return fn(key);
  }

  lock(): void {
    this.#key = null;
  }
}

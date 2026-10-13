import { argon2id } from 'hash-wasm';
import { assertSupportedPin } from '../vault/pin-policy';
import { DEFAULT_ARGON2_PARAMS, TEST_ARGON2_PARAMS, type Argon2Params } from '../vault/pin-kdf';

function assertCloudArgon2Params(params: Argon2Params): void {
  if (
    params.memoryKiB === TEST_ARGON2_PARAMS.memoryKiB
    && params.iterations === TEST_ARGON2_PARAMS.iterations
    && params.parallelism === TEST_ARGON2_PARAMS.parallelism
    && params.hashLength === TEST_ARGON2_PARAMS.hashLength
  ) return;
  if (!Number.isInteger(params.memoryKiB) || params.memoryKiB < 19 * 1024 || params.memoryKiB > 256 * 1024) {
    throw new TypeError('Argon2 memory cost is outside the supported security bounds.');
  }
  if (!Number.isInteger(params.iterations) || params.iterations < 2 || params.iterations > 10) {
    throw new TypeError('Argon2 iteration count is outside the supported security bounds.');
  }
  if (!Number.isInteger(params.parallelism) || params.parallelism < 1 || params.parallelism > 4) {
    throw new TypeError('Argon2 parallelism is outside the supported security bounds.');
  }
  if (params.hashLength !== 32) throw new TypeError('Argon2 output length must be 32 bytes.');
}

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

export async function deriveCloudRootKey(
  pin: string,
  accountSalt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<Uint8Array> {
  assertSupportedPin(pin);
  assertCloudArgon2Params(params);
  if (accountSalt.length !== 32) throw new TypeError('Cloud account salt must be 32 bytes.');

  const pinBytes = new TextEncoder().encode(pin);
  try {
    const derived = await argon2id({
      password: pinBytes,
      salt: accountSalt,
      parallelism: params.parallelism,
      iterations: params.iterations,
      memorySize: params.memoryKiB,
      hashLength: params.hashLength,
      outputType: 'binary',
    });
    if (!(derived instanceof Uint8Array)) throw new TypeError('Argon2id returned an unexpected result type.');
    return derived;
  } finally {
    pinBytes.fill(0);
  }
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

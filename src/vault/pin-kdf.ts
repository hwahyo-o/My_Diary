import { argon2id } from 'hash-wasm';
import { assertValidPin } from './pin-policy';

export interface Argon2Params {
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly hashLength: number;
}

export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memoryKiB: 19 * 1024,
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
};

export const TEST_ARGON2_PARAMS: Argon2Params = {
  memoryKiB: 64,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
};

export async function deriveDeviceKek(
  pin: string,
  deviceSecret: Uint8Array,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<Uint8Array> {
  assertValidPin(pin);
  if (deviceSecret.length !== 32) throw new TypeError('Device Secret must be 32 bytes.');
  if (salt.length < 16) throw new TypeError('Argon2id salt must be at least 16 bytes.');

  const pinBytes = new TextEncoder().encode(pin);
  const password = new Uint8Array(pinBytes.length + 1 + deviceSecret.length);
  password.set(pinBytes, 0);
  password[pinBytes.length] = 0;
  password.set(deviceSecret, pinBytes.length + 1);

  try {
    const derived = await argon2id({
      password,
      salt,
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
    password.fill(0);
  }
}

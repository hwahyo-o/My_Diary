import { argon2id } from 'hash-wasm';
import { assertSupportedPin } from './pin-policy';

export interface Argon2Params {
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly hashLength: number;
}

export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memoryKiB: 32 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};

export const TEST_ARGON2_PARAMS: Argon2Params = {
  memoryKiB: 64,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
};

function assertArgon2Params(params: Argon2Params): void {
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
  if (params.hashLength !== 32) {
    throw new TypeError('Argon2 output length must be 32 bytes.');
  }
}

export async function deriveDeviceKek(
  pin: string,
  deviceSecret: Uint8Array,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<Uint8Array> {
  assertSupportedPin(pin);
  assertArgon2Params(params);
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

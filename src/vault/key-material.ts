const SECRET_BYTES = 32;

function generateSecret(): Uint8Array {
  const bytes = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function generateVaultKey(): Uint8Array {
  return generateSecret();
}

export function generateDeviceSecret(): Uint8Array {
  return generateSecret();
}

export function generateRecoveryKey(): Uint8Array {
  return generateSecret();
}

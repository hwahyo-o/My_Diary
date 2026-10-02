export const MAX_VAULT_FILE_BYTES = 50 * 1024 * 1024;

export function makeVaultFilename(randomBytes = crypto.getRandomValues(new Uint8Array(6))): string {
  const token = [...randomBytes].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `vault-${token}.vault`;
}

export async function readVaultFile(file: File): Promise<Uint8Array> {
  if (file.size > MAX_VAULT_FILE_BYTES) {
    throw new Error('Vault 파일은 50 MiB 이하여야 합니다.');
  }
  return new Uint8Array(await file.arrayBuffer());
}

export function downloadVaultBytes(bytes: Uint8Array, filename = makeVaultFilename()): void {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const MAX_VAULT_FILE_BYTES = 50 * 1024 * 1024;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function makeVaultFilename(randomBytes = crypto.getRandomValues(new Uint8Array(6))): string {
  const token = [...randomBytes].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `vault-${token}.vault`;
}

export async function readVaultFile(file: File): Promise<Uint8Array> {
  if (file.size > MAX_VAULT_FILE_BYTES) {
    throw new Error('Vault 파일은 50 MiB 이하여야 합니다.');
  }

  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Vault 파일을 읽지 못했습니다.'));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('Vault 파일을 바이너리 데이터로 읽지 못했습니다.'));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(file);
  });
}

export function downloadVaultBytes(bytes: Uint8Array, filename = makeVaultFilename()): void {
  const blob = new Blob([toArrayBuffer(bytes)], { type: 'application/octet-stream' });
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

const DATABASE_NAME = 'my-diary-local-backups-v1';
const DATABASE_VERSION = 1;
const METADATA_STORE = 'metadata';
const PAYLOAD_STORE = 'payloads';

export interface LocalBackupSummary {
  readonly id: string;
  readonly filename: string;
  readonly exportedAt: string;
  readonly sizeBytes: number;
}

interface BackupMetadata extends LocalBackupSummary {}
interface BackupPayload {
  readonly id: string;
  readonly bytes: ArrayBuffer;
}

function openArchive(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(PAYLOAD_STORE)) {
        database.createObjectStore(PAYLOAD_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local backup storage.'));
    request.onblocked = () => reject(new Error('Local backup storage is blocked by another tab.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Local backup storage failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Local backup storage was interrupted.'));
  });
}

export async function saveLocalBackup(
  bytes: Uint8Array,
  filename: string,
  exportedAt: string,
): Promise<LocalBackupSummary> {
  const database = await openArchive();
  const id = crypto.randomUUID();
  const summary: LocalBackupSummary = { id, filename, exportedAt, sizeBytes: bytes.byteLength };
  try {
    const transaction = database.transaction([METADATA_STORE, PAYLOAD_STORE], 'readwrite');
    transaction.objectStore(METADATA_STORE).put(summary);
    transaction.objectStore(PAYLOAD_STORE).put({ id, bytes: bytes.slice().buffer } satisfies BackupPayload);
    await transactionDone(transaction);
    return summary;
  } finally {
    database.close();
  }
}

export async function listLocalBackups(): Promise<LocalBackupSummary[]> {
  const database = await openArchive();
  try {
    const transaction = database.transaction(METADATA_STORE, 'readonly');
    const request = transaction.objectStore(METADATA_STORE).getAll() as IDBRequest<BackupMetadata[]>;
    const rows = await new Promise<BackupMetadata[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error ?? new Error('Could not read local backups.'));
    });
    await transactionDone(transaction);
    return rows.sort((a, b) => b.exportedAt.localeCompare(a.exportedAt));
  } finally {
    database.close();
  }
}

export async function readLocalBackup(id: string): Promise<{ readonly summary: LocalBackupSummary; readonly bytes: Uint8Array }> {
  const database = await openArchive();
  try {
    const transaction = database.transaction([METADATA_STORE, PAYLOAD_STORE], 'readonly');
    const metadataRequest = transaction.objectStore(METADATA_STORE).get(id) as IDBRequest<BackupMetadata | undefined>;
    const payloadRequest = transaction.objectStore(PAYLOAD_STORE).get(id) as IDBRequest<BackupPayload | undefined>;
    const [summary, payload] = await Promise.all([
      new Promise<BackupMetadata | undefined>((resolve, reject) => {
        metadataRequest.onsuccess = () => resolve(metadataRequest.result);
        metadataRequest.onerror = () => reject(metadataRequest.error ?? new Error('Could not read backup details.'));
      }),
      new Promise<BackupPayload | undefined>((resolve, reject) => {
        payloadRequest.onsuccess = () => resolve(payloadRequest.result);
        payloadRequest.onerror = () => reject(payloadRequest.error ?? new Error('Could not read backup data.'));
      }),
    ]);
    await transactionDone(transaction);
    if (!summary || !payload) throw new Error('The selected local backup is unavailable.');
    return { summary, bytes: new Uint8Array(payload.bytes) };
  } finally {
    database.close();
  }
}

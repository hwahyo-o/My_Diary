import type { ISODateTime, UUID } from '../../domain/shared/types';
import type { Transaction } from '../../domain/transactions/types';
import type { EncryptedRepository, StoredEvent } from '../../storage/repository';
import { decryptRecord, encryptRecord, type EncryptedRecordEnvelope, type RecordAad } from '../../vault/record-crypto';
import type { VaultSession } from '../../vault/session';
import { detectDuplicateRisk } from './duplicate-detector';
import type { TransactionDraft } from './types';
import { validateTransactionDraft } from './validation';

interface TransactionServiceDeps {
  readonly repository: EncryptedRepository;
  readonly session: VaultSession;
  readonly vaultId: string;
  readonly schemaVersion: number;
  readonly deviceId: UUID;
  readonly newTransactionId: () => UUID;
  readonly newEventId: () => UUID;
  readonly now: () => ISODateTime;
}

export interface SaveDraftOptions {
  readonly expectedRevision: number;
  readonly duplicateCandidates?: readonly Transaction[];
  readonly confirmDuplicate?: boolean;
}

export interface MutationResult {
  readonly transaction: Transaction;
  readonly revision: number;
}

interface MutationPatch {
  readonly before: Transaction | null;
  readonly after: Transaction;
}

function encodeEnvelope(envelope: EncryptedRecordEnvelope): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({
    algorithm: envelope.algorithm,
    iv: [...envelope.iv],
    ciphertext: [...envelope.ciphertext],
  }));
}

function decodeEnvelope(bytes: Uint8Array): EncryptedRecordEnvelope {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
    algorithm: 'AES-GCM';
    iv: number[];
    ciphertext: number[];
  };
  return {
    algorithm: parsed.algorithm,
    iv: new Uint8Array(parsed.iv),
    ciphertext: new Uint8Array(parsed.ciphertext),
  };
}

export class TransactionLedgerService {
  constructor(private readonly deps: TransactionServiceDeps) {}

  async saveDraft(draftInput: TransactionDraft, options: SaveDraftOptions): Promise<MutationResult> {
    const draft = validateTransactionDraft(draftInput);
    const duplicates = detectDuplicateRisk(draft, options.duplicateCandidates ?? []);
    if (duplicates.risk === 'high' && !options.confirmDuplicate) {
      throw new Error('High-risk duplicate transaction requires confirmation.');
    }

    const timestamp = this.deps.now();
    const transaction: Transaction = {
      ...draft,
      id: this.deps.newTransactionId(),
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
    };

    const revision = await this.persistMutation(transaction, null, 'create', options.expectedRevision);
    return { transaction, revision };
  }

  async deleteTransaction(recordId: UUID, expectedRevision: number): Promise<MutationResult> {
    const current = await this.loadTransaction(recordId);
    if (current.deletedAt) return { transaction: current, revision: expectedRevision };
    const timestamp = this.deps.now();
    const next: Transaction = {
      ...current,
      deletedAt: timestamp,
      updatedAt: timestamp,
      version: current.version + 1,
    };
    const revision = await this.persistMutation(next, current, 'delete', expectedRevision);
    return { transaction: next, revision };
  }

  async restoreTransaction(recordId: UUID, expectedRevision: number): Promise<MutationResult> {
    const current = await this.loadTransaction(recordId);
    if (!current.deletedAt) return { transaction: current, revision: expectedRevision };
    const timestamp = this.deps.now();
    const next: Transaction = {
      ...current,
      deletedAt: undefined,
      updatedAt: timestamp,
      version: current.version + 1,
    };
    const revision = await this.persistMutation(next, current, 'restore', expectedRevision);
    return { transaction: next, revision };
  }

  async undoLastMutation(recordId: UUID, expectedRevision: number): Promise<MutationResult> {
    const current = await this.loadTransaction(recordId);
    const events = await this.deps.repository.listEventsByRecord(recordId);
    const latest = events.at(-1);
    if (!latest) throw new Error('No transaction history is available to undo.');
    const patch = await this.decryptPatch(latest);
    if (!patch.before) throw new Error('Initial create cannot be undone by this operation.');

    const timestamp = this.deps.now();
    const next: Transaction = {
      ...patch.before,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: timestamp,
      version: current.version + 1,
    };
    const revision = await this.persistMutation(next, current, 'update', expectedRevision);
    return { transaction: next, revision };
  }

  private async loadTransaction(recordId: UUID): Promise<Transaction> {
    const stored = await this.deps.repository.getRecord(recordId);
    if (!stored) throw new Error('Transaction not found.');
    const aad: RecordAad = {
      vaultId: this.deps.vaultId,
      recordId: stored.recordId,
      recordType: stored.recordType,
      schemaVersion: this.deps.schemaVersion,
      recordVersion: stored.recordVersion,
    };
    return this.deps.session.withVaultKey((key) => decryptRecord<Transaction>(key, aad, decodeEnvelope(stored.encryptedPayload)));
  }

  private async persistMutation(
    after: Transaction,
    before: Transaction | null,
    action: StoredEvent['action'],
    expectedRevision: number,
  ): Promise<number> {
    const events = await this.deps.repository.listEventsByRecord(after.id);
    const deviceSeq = events
      .filter((event) => event.deviceId === this.deps.deviceId)
      .reduce((max, event) => Math.max(max, event.deviceSeq), 0) + 1;
    const eventId = this.deps.newEventId();
    const recordAad: RecordAad = {
      vaultId: this.deps.vaultId,
      recordId: after.id,
      recordType: 'transaction',
      schemaVersion: this.deps.schemaVersion,
      recordVersion: after.version,
    };
    const eventAad: RecordAad = {
      vaultId: this.deps.vaultId,
      recordId: eventId,
      recordType: 'transaction-event',
      schemaVersion: this.deps.schemaVersion,
      recordVersion: deviceSeq,
    };

    const [recordEnvelope, eventEnvelope] = await this.deps.session.withVaultKey(async (key) => Promise.all([
      encryptRecord(key, recordAad, after),
      encryptRecord<MutationPatch>(key, eventAad, { before, after }),
    ]));

    return this.deps.repository.commitRecordEvent(
      this.deps.vaultId,
      {
        recordId: after.id,
        recordType: 'transaction',
        updatedAt: after.updatedAt,
        recordVersion: after.version,
        encryptedPayload: encodeEnvelope(recordEnvelope),
      },
      {
        eventId,
        recordId: after.id,
        recordType: 'transaction',
        action,
        deviceId: this.deps.deviceId,
        deviceSeq,
        createdAt: after.updatedAt,
        encryptedPatch: encodeEnvelope(eventEnvelope),
      },
      expectedRevision,
    );
  }

  private async decryptPatch(event: StoredEvent): Promise<MutationPatch> {
    const aad: RecordAad = {
      vaultId: this.deps.vaultId,
      recordId: event.eventId,
      recordType: 'transaction-event',
      schemaVersion: this.deps.schemaVersion,
      recordVersion: event.deviceSeq,
    };
    return this.deps.session.withVaultKey((key) => decryptRecord<MutationPatch>(key, aad, decodeEnvelope(event.encryptedPatch)));
  }
}

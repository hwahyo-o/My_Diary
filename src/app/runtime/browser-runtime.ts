import type { Account, AccountKind, AccountPurpose } from '../../domain/accounts/types';
import { analyzeAccountPurposes } from '../../domain/accounts/purpose-analysis';
import { selectBudgetUsage } from '../../domain/analytics/budget';
import { selectCoreAnalytics } from '../../domain/analytics/core';
import type { Budget } from '../../domain/budgets/types';
import { buildHoldingInsight } from '../../domain/holdings/insights';
import type { Holding } from '../../domain/holdings/types';
import type { Loan } from '../../domain/loans/types';
import { selectNetWorth } from '../../domain/net-worth/selectors';
import { generateMonthlyReport } from '../../domain/reports/generator';
import { generatePeriodReport } from '../../domain/reports/period-generator';
import { parseISODate, parseISODateTime, parseUUID, type ISODate, type ISODateTime, type UUID } from '../../domain/shared/types';
import { getIncomeExpenseImpact } from '../../domain/transactions/accounting';
import type { Transaction } from '../../domain/transactions/types';
import { quickCandidateToDraft, parseQuickInput } from '../../features/transactions/quick-parser';
import { TransactionLedgerService } from '../../features/transactions/transaction-service';
import { createDirectDraft } from '../../features/transactions/validation';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from '../../storage/repository';
import { generateDeviceSecret, generateRecoveryKey, generateVaultKey } from '../../vault/key-material';
import { wrapVaultKey, unwrapVaultKey, type WrappedKeyEnvelope } from '../../vault/key-wrap';
import { deriveDeviceKek, DEFAULT_ARGON2_PARAMS, TEST_ARGON2_PARAMS, type Argon2Params } from '../../vault/pin-kdf';
import { deriveRecoveryKek } from '../../vault/recovery';
import { decryptRecord, encryptRecord, type EncryptedRecordEnvelope, type RecordAad } from '../../vault/record-crypto';
import { VaultSession } from '../../vault/session';
import type { AccessState, DashboardViewModel, ReportSummaryViewModel, TransactionSubmission } from '../ui-types';
import { emptyDashboard } from '../ui-types';
import {
  base64UrlToBytes,
  createVaultPackage,
  verifyVaultPackage,
  type VerifiedVaultPackage,
  type VaultBackupManifest,
} from './vault-backup-package';

interface RuntimeProfile {
  readonly id: UUID;
  readonly nickname: string;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
  readonly version: number;
}

interface BootstrapMeta {
  readonly vaultId: string;
  readonly profileRecordId: UUID;
  readonly defaultAccountId: UUID;
  readonly deviceId: UUID;
  readonly deviceSecret: Uint8Array;
  readonly pinSalt: Uint8Array;
  readonly argon2Params: Argon2Params;
  readonly wrappedDeviceVaultKey: WrappedKeyEnvelope;
  readonly wrappedRecoveryVaultKey: WrappedKeyEnvelope;
  readonly failedAttempts: number;
}

interface RuntimeEntity {
  readonly id: UUID;
  readonly createdAt: ISODateTime;
  readonly updatedAt: ISODateTime;
  readonly version: number;
}

export interface RuntimeSnapshot {
  readonly access: AccessState;
  readonly dashboard: DashboardViewModel;
}

export interface VaultImportInspection {
  readonly vaultId: string;
  readonly newRecords: number;
  readonly updatedRecords: number;
  readonly localOnlyRecords: number;
  readonly sameRecords: number;
  readonly conflicts: number;
}

export interface BrowserRuntimeOptions {
  readonly dbName?: string;
  readonly argon2Profile?: 'production' | 'test';
  readonly now?: () => Date;
}

const BOOTSTRAP_KEY = 'device-bootstrap-v1';
const SCHEMA_VERSION = 1;
const MAX_PIN_FAILURES = 10;

function toIso(now: Date): ISODateTime {
  return parseISODateTime(now.toISOString());
}

function newUuid(): UUID {
  return parseUUID(crypto.randomUUID());
}

function currentDate(now: Date): ISODate {
  return parseISODate(now.toISOString().slice(0, 10));
}

function currentMonthStart(now: Date): ISODate {
  const date = now.toISOString().slice(0, 7);
  return parseISODate(`${date}-01`);
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

function wrapAad(vaultId: string, kind: 'device' | 'recovery'): Uint8Array {
  return new TextEncoder().encode(`my-diary/${kind}-vault-wrap/v1/${vaultId}`);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function entityAad(vaultId: string, recordId: string, recordType: string, recordVersion: number): RecordAad {
  return { vaultId, recordId, recordType, schemaVersion: SCHEMA_VERSION, recordVersion };
}

function profileAad(vaultId: string, profile: Pick<RuntimeProfile, 'id' | 'version'>): RecordAad {
  return entityAad(vaultId, profile.id, 'profile', profile.version);
}

function transactionAad(vaultId: string, recordId: string, recordVersion: number): RecordAad {
  return entityAad(vaultId, recordId, 'transaction', recordVersion);
}

function periodLabel(now: Date): string {
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let index = 0; index < a.byteLength; index += 1) diff |= a[index]! ^ b[index]!;
  return diff === 0;
}

function recordsEqual(a: StoredEncryptedRecord, b: StoredEncryptedRecord): boolean {
  return a.recordId === b.recordId
    && a.recordType === b.recordType
    && a.updatedAt === b.updatedAt
    && a.recordVersion === b.recordVersion
    && equalBytes(a.encryptedPayload, b.encryptedPayload);
}

function balanceAccounts(accounts: readonly Account[], transactions: readonly Transaction[]): Map<UUID, number> {
  const result = new Map<UUID, number>();
  for (const account of accounts) {
    const opening = account.openingBalanceMinor ?? 0;
    result.set(account.id, account.kind === 'credit' ? -opening : opening);
  }

  const add = (id: UUID | undefined, delta: number) => {
    if (!id || !result.has(id)) return;
    result.set(id, (result.get(id) ?? 0) + delta);
  };

  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    const fee = transaction.feeMinor ?? 0;
    switch (transaction.type) {
      case 'income':
        add(transaction.accountId, transaction.amountMinor);
        break;
      case 'expense':
        add(transaction.accountId, -transaction.amountMinor);
        break;
      case 'transfer':
      case 'saving':
        add(transaction.accountId, -transaction.amountMinor);
        add(transaction.counterAccountId, transaction.amountMinor);
        break;
      case 'loan_payment':
        add(transaction.accountId, -transaction.amountMinor);
        break;
      case 'investment_buy':
        add(transaction.accountId, -(transaction.amountMinor + fee));
        break;
      case 'investment_sell':
        add(transaction.accountId, transaction.amountMinor - fee);
        break;
      case 'adjustment':
        add(transaction.accountId, transaction.amountMinor);
        break;
    }
  }
  return result;
}

function loanPrincipalFor(account: Account, transactions: readonly Transaction[]): number {
  const opening = Math.max(0, account.openingBalanceMinor ?? 0);
  const paid = transactions.reduce((sum, transaction) => {
    if (transaction.deletedAt || transaction.type !== 'loan_payment') return sum;
    if (transaction.counterAccountId !== account.id && transaction.accountId !== account.id) return sum;
    return sum + (transaction.principalMinor ?? 0);
  }, 0);
  return Math.max(0, opening - paid);
}

export class BrowserRuntime {
  private session: VaultSession | null = null;
  private bootstrap: BootstrapMeta | null = null;
  private snapshot: RuntimeSnapshot = { access: 'onboarding', dashboard: emptyDashboard };
  private readonly listeners = new Set<(snapshot: RuntimeSnapshot) => void>();

  private constructor(
    private readonly db: IDBDatabase,
    private readonly repository: EncryptedRepository,
    private readonly options: Required<Pick<BrowserRuntimeOptions, 'argon2Profile' | 'now'>>,
  ) {}

  static async open(options: BrowserRuntimeOptions = {}): Promise<BrowserRuntime> {
    const db = await openVaultDatabase(options.dbName);
    const repository = new EncryptedRepository(db);
    const runtime = new BrowserRuntime(db, repository, {
      argon2Profile: options.argon2Profile ?? 'production',
      now: options.now ?? (() => new Date()),
    });
    runtime.bootstrap = await repository.getSecurityMeta<BootstrapMeta>(BOOTSTRAP_KEY) ?? null;
    runtime.snapshot = {
      access: runtime.bootstrap ? 'locked' : 'onboarding',
      dashboard: emptyDashboard,
    };
    return runtime;
  }

  getSnapshot(): RuntimeSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: RuntimeSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async createProfile(input: { readonly nickname: string; readonly pin: string }): Promise<{ readonly recoveryKey: string }> {
    if (this.bootstrap) throw new Error('A local vault is already configured.');
    const nickname = input.nickname.trim();
    if (!nickname) throw new TypeError('Nickname is required.');

    const vaultId = crypto.randomUUID();
    const profileRecordId = newUuid();
    const defaultAccountId = newUuid();
    const deviceId = newUuid();
    const vaultKey = generateVaultKey();
    const deviceSecret = generateDeviceSecret();
    const recoveryKey = generateRecoveryKey();
    const pinSalt = crypto.getRandomValues(new Uint8Array(16));
    const params = this.options.argon2Profile === 'test' ? TEST_ARGON2_PARAMS : DEFAULT_ARGON2_PARAMS;
    const deviceKek = await deriveDeviceKek(input.pin, deviceSecret, pinSalt, params);
    const recoveryKek = await deriveRecoveryKek(recoveryKey, vaultId);

    try {
      const [wrappedDeviceVaultKey, wrappedRecoveryVaultKey] = await Promise.all([
        wrapVaultKey(vaultKey, deviceKek, wrapAad(vaultId, 'device')),
        wrapVaultKey(vaultKey, recoveryKek, wrapAad(vaultId, 'recovery')),
      ]);
      const session = await VaultSession.unlock(vaultKey.slice());
      const timestamp = toIso(this.options.now());
      const profile: RuntimeProfile = {
        id: profileRecordId,
        nickname,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
      };

      await this.persistProfile(session, vaultId, deviceId, profile);
      const bootstrap: BootstrapMeta = {
        vaultId,
        profileRecordId,
        defaultAccountId,
        deviceId,
        deviceSecret,
        pinSalt,
        argon2Params: params,
        wrappedDeviceVaultKey,
        wrappedRecoveryVaultKey,
        failedAttempts: 0,
      };
      await this.repository.putSecurityMeta(BOOTSTRAP_KEY, bootstrap);
      this.bootstrap = bootstrap;
      this.session = session;
      await this.hydrate();
      return { recoveryKey: toBase64Url(recoveryKey) };
    } finally {
      vaultKey.fill(0);
      deviceKek.fill(0);
      recoveryKek.fill(0);
      recoveryKey.fill(0);
    }
  }

  async unlock(pin: string): Promise<void> {
    const bootstrap = this.bootstrap ?? await this.repository.getSecurityMeta<BootstrapMeta>(BOOTSTRAP_KEY);
    if (!bootstrap) throw new Error('No local vault is configured.');
    if (bootstrap.failedAttempts >= MAX_PIN_FAILURES) throw new Error('Local authenticator is disabled.');

    const kek = await deriveDeviceKek(pin, bootstrap.deviceSecret, bootstrap.pinSalt, bootstrap.argon2Params);
    try {
      const rawVaultKey = await unwrapVaultKey(
        bootstrap.wrappedDeviceVaultKey,
        kek,
        wrapAad(bootstrap.vaultId, 'device'),
      );
      this.session = await VaultSession.unlock(rawVaultKey);
      const resetBootstrap = { ...bootstrap, failedAttempts: 0 };
      await this.repository.putSecurityMeta(BOOTSTRAP_KEY, resetBootstrap);
      this.bootstrap = resetBootstrap;
      await this.hydrate();
    } catch (error) {
      this.session?.lock();
      this.session = null;
      const failedBootstrap = { ...bootstrap, failedAttempts: bootstrap.failedAttempts + 1 };
      await this.repository.putSecurityMeta(BOOTSTRAP_KEY, failedBootstrap);
      this.bootstrap = failedBootstrap;
      this.setSnapshot({ access: 'locked', dashboard: emptyDashboard });
      throw error;
    } finally {
      kek.fill(0);
    }
  }

  async submitTransaction(input: TransactionSubmission): Promise<void> {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');

    const now = toIso(this.options.now());
    const draft = input.mode === 'quick'
      ? quickCandidateToDraft(parseQuickInput(input.text, now), { accountId: bootstrap.defaultAccountId, type: 'expense' })
      : createDirectDraft({
          type: input.type ?? 'expense',
          accountId: input.accountId ? parseUUID(input.accountId) : bootstrap.defaultAccountId,
          ...(input.counterAccountId ? { counterAccountId: parseUUID(input.counterAccountId) } : {}),
          amountMinor: input.amountMinor,
          occurredAt: now,
          memo: input.memo,
          ...(input.principalMinor === undefined ? {} : { principalMinor: input.principalMinor }),
          ...(input.interestMinor === undefined ? {} : { interestMinor: input.interestMinor }),
          ...(input.feeMinor === undefined ? {} : { feeMinor: input.feeMinor }),
        });

    const service = new TransactionLedgerService({
      repository: this.repository,
      session,
      vaultId: bootstrap.vaultId,
      schemaVersion: SCHEMA_VERSION,
      deviceId: bootstrap.deviceId,
      newTransactionId: newUuid,
      newEventId: newUuid,
      now: () => toIso(this.options.now()),
    });
    const revision = await this.repository.getRevision(bootstrap.vaultId);
    await service.saveDraft(draft, { expectedRevision: revision });
    await this.hydrate();
  }

  async saveAccount(input: {
    readonly name: string;
    readonly kind: AccountKind;
    readonly purpose: AccountPurpose;
    readonly openingBalanceMinor: number;
    readonly includeNetWorth: boolean;
  }): Promise<UUID> {
    const { session, bootstrap } = this.requireUnlocked();
    const name = input.name.trim();
    if (!name) throw new TypeError('Account name is required.');
    if (!Number.isSafeInteger(input.openingBalanceMinor) || input.openingBalanceMinor < 0) {
      throw new TypeError('Opening balance must be a non-negative safe integer.');
    }
    const now = toIso(this.options.now());
    const account: Account = {
      id: newUuid(),
      createdAt: now,
      updatedAt: now,
      version: 1,
      name,
      kind: input.kind,
      purpose: input.purpose,
      openingBalanceMinor: input.openingBalanceMinor,
      includeNetWorth: input.includeNetWorth,
    };
    await this.persistEntity(session, bootstrap, 'account', account);
    await this.hydrate();
    return account.id;
  }

  async saveHolding(input: {
    readonly accountId: string;
    readonly ticker: string;
    readonly quantity: string;
    readonly avgCostMinor: number;
    readonly marketValueMinor: number;
    readonly priceAsOf: string;
  }): Promise<UUID> {
    const { session, bootstrap } = this.requireUnlocked();
    const ticker = input.ticker.trim().toUpperCase();
    const quantity = Number(input.quantity);
    if (!ticker) throw new TypeError('Ticker is required.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new TypeError('Quantity must be positive.');
    if (!Number.isSafeInteger(input.avgCostMinor) || input.avgCostMinor < 0) throw new TypeError('Average cost is invalid.');
    if (!Number.isSafeInteger(input.marketValueMinor) || input.marketValueMinor < 0) throw new TypeError('Market value is invalid.');
    const now = toIso(this.options.now());
    const holding: Holding = {
      id: newUuid(),
      createdAt: now,
      updatedAt: now,
      version: 1,
      accountId: parseUUID(input.accountId),
      ticker,
      quantity: input.quantity,
      avgCostMinor: input.avgCostMinor,
      marketValueMinor: input.marketValueMinor,
      priceAsOf: parseISODate(input.priceAsOf),
    };
    await this.persistEntity(session, bootstrap, 'holding', holding);
    await this.hydrate();
    return holding.id;
  }

  async setMonthlyBudget(limitMinor: number): Promise<void> {
    const { session, bootstrap } = this.requireUnlocked();
    if (!Number.isSafeInteger(limitMinor) || limitMinor < 0) throw new TypeError('Budget limit must be a non-negative safe integer.');
    const now = toIso(this.options.now());
    const budget: Budget = {
      id: newUuid(),
      createdAt: now,
      updatedAt: now,
      version: 1,
      month: currentMonthStart(this.options.now()),
      limitMinor,
      alertPercents: [50, 80, 100],
    };
    await this.persistEntity(session, bootstrap, 'budget', budget);
    await this.hydrate();
  }

  async exportVault(input: { readonly recoveryKey: string }): Promise<Uint8Array> {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');
    const recoveryKey = base64UrlToBytes(input.recoveryKey);
    if (recoveryKey.length !== 32) throw new Error('RecoveryKey has an invalid length.');
    const recoveryKek = await deriveRecoveryKek(recoveryKey, bootstrap.vaultId);
    let recoveryUnwrapped: Uint8Array | null = null;
    try {
      recoveryUnwrapped = await unwrapVaultKey(
        bootstrap.wrappedRecoveryVaultKey,
        recoveryKek,
        wrapAad(bootstrap.vaultId, 'recovery'),
      );
      const profileRecord = await this.repository.getRecord(bootstrap.profileRecordId);
      if (!profileRecord) throw new Error('Encrypted profile record is missing.');
      await decryptRecord<RuntimeProfile>(
        recoveryUnwrapped,
        profileAad(bootstrap.vaultId, { id: bootstrap.profileRecordId, version: profileRecord.recordVersion }),
        decodeEnvelope(profileRecord.encryptedPayload),
      );

      const [records, events, revision] = await Promise.all([
        this.repository.listAllRecords(),
        this.repository.listAllEvents(),
        this.repository.getRevision(bootstrap.vaultId),
      ]);
      const manifest: VaultBackupManifest = {
        profileRecordId: bootstrap.profileRecordId,
        defaultAccountId: bootstrap.defaultAccountId,
        revision,
      };
      return session.withVaultKey((vaultKey) => createVaultPackage({
        schemaVersion: SCHEMA_VERSION,
        vaultId: bootstrap.vaultId,
        createdAt: toIso(this.options.now()),
        recoveryKey,
        recoveryWrap: bootstrap.wrappedRecoveryVaultKey,
        vaultKey,
        manifest,
        records,
        events,
      }));
    } finally {
      recoveryUnwrapped?.fill(0);
      recoveryKek.fill(0);
      recoveryKey.fill(0);
    }
  }

  async inspectVaultImport(packageBytes: Uint8Array, input: { readonly recoveryKey: string }): Promise<VaultImportInspection> {
    const verified = await verifyVaultPackage(packageBytes, input.recoveryKey);
    try {
      if (verified.schemaVersion > SCHEMA_VERSION) throw new Error('Vault package uses a future schema version.');
      const localRecords = await this.repository.listAllRecords();
      return this.diffRecords(verified, localRecords);
    } finally {
      verified.vaultKey.fill(0);
    }
  }

  async applyVaultImport(packageBytes: Uint8Array, input: { readonly recoveryKey: string }): Promise<void> {
    const bootstrap = this.bootstrap;
    const session = this.session;
    if (!bootstrap || !session?.isUnlocked) throw new Error('Vault session is locked.');
    const verified = await verifyVaultPackage(packageBytes, input.recoveryKey);
    try {
      if (verified.schemaVersion > SCHEMA_VERSION) throw new Error('Vault package uses a future schema version.');
      if (verified.vaultId !== bootstrap.vaultId) throw new Error('Vault package belongs to a different Vault.');
      const localRecords = await this.repository.listAllRecords();
      const inspection = this.diffRecords(verified, localRecords);
      if (inspection.conflicts > 0 || inspection.localOnlyRecords > 0) {
        throw new Error('Vault import requires explicit conflict resolution.');
      }

      const currentBackup = await this.exportVault(input);
      await this.repository.putSnapshot({
        snapshotId: newUuid(),
        vaultId: bootstrap.vaultId,
        createdAt: toIso(this.options.now()),
        reason: 'pre-import',
        schemaVersion: SCHEMA_VERSION,
        encryptedPayload: currentBackup,
      });
      const nextBootstrap: BootstrapMeta = {
        ...bootstrap,
        profileRecordId: parseUUID(verified.manifest.profileRecordId),
        defaultAccountId: parseUUID(verified.manifest.defaultAccountId),
        wrappedRecoveryVaultKey: verified.recoveryWrap,
      };
      await this.repository.replaceVaultData({
        vaultId: verified.vaultId,
        schemaVersion: verified.schemaVersion,
        revision: verified.manifest.revision,
        records: verified.records,
        events: verified.events,
        securityMeta: { key: BOOTSTRAP_KEY, value: nextBootstrap },
      });
      this.bootstrap = nextBootstrap;
      await this.hydrate();
    } finally {
      verified.vaultKey.fill(0);
    }
  }

  async recoverFromVault(input: {
    readonly packageBytes: Uint8Array;
    readonly recoveryKey: string;
    readonly pin: string;
  }): Promise<void> {
    if (this.bootstrap) throw new Error('Recovery requires a fresh local device profile.');
    const verified = await verifyVaultPackage(input.packageBytes, input.recoveryKey);
    const deviceSecret = generateDeviceSecret();
    const pinSalt = crypto.getRandomValues(new Uint8Array(16));
    const deviceId = newUuid();
    const params = this.options.argon2Profile === 'test' ? TEST_ARGON2_PARAMS : DEFAULT_ARGON2_PARAMS;
    const deviceKek = await deriveDeviceKek(input.pin, deviceSecret, pinSalt, params);
    try {
      if (verified.schemaVersion > SCHEMA_VERSION) throw new Error('Vault package uses a future schema version.');
      const wrappedDeviceVaultKey = await wrapVaultKey(
        verified.vaultKey,
        deviceKek,
        wrapAad(verified.vaultId, 'device'),
      );
      const bootstrap: BootstrapMeta = {
        vaultId: verified.vaultId,
        profileRecordId: parseUUID(verified.manifest.profileRecordId),
        defaultAccountId: parseUUID(verified.manifest.defaultAccountId),
        deviceId,
        deviceSecret,
        pinSalt,
        argon2Params: params,
        wrappedDeviceVaultKey,
        wrappedRecoveryVaultKey: verified.recoveryWrap,
        failedAttempts: 0,
      };
      await this.repository.replaceVaultData({
        vaultId: verified.vaultId,
        schemaVersion: verified.schemaVersion,
        revision: verified.manifest.revision,
        records: verified.records,
        events: verified.events,
        securityMeta: { key: BOOTSTRAP_KEY, value: bootstrap },
      });
      this.bootstrap = bootstrap;
      this.session = await VaultSession.unlock(verified.vaultKey.slice());
      await this.hydrate();
    } finally {
      verified.vaultKey.fill(0);
      deviceKek.fill(0);
    }
  }

  lock(): void {
    this.session?.lock();
    this.session = null;
    this.setSnapshot({
      access: this.bootstrap ? 'locked' : 'onboarding',
      dashboard: emptyDashboard,
    });
  }

  close(): void {
    this.lock();
    this.listeners.clear();
    this.db.close();
  }

  private requireUnlocked(): { session: VaultSession; bootstrap: BootstrapMeta } {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');
    return { session, bootstrap };
  }

  private diffRecords(verified: VerifiedVaultPackage, localRecords: readonly StoredEncryptedRecord[]): VaultImportInspection {
    const local = new Map(localRecords.map((record) => [record.recordId, record]));
    let newRecords = 0;
    let updatedRecords = 0;
    let sameRecords = 0;
    let conflicts = 0;
    for (const incoming of verified.records) {
      const existing = local.get(incoming.recordId);
      if (!existing) {
        newRecords += 1;
        continue;
      }
      local.delete(incoming.recordId);
      if (recordsEqual(existing, incoming)) {
        sameRecords += 1;
      } else if (incoming.recordVersion > existing.recordVersion) {
        updatedRecords += 1;
      } else {
        conflicts += 1;
      }
    }
    return {
      vaultId: verified.vaultId,
      newRecords,
      updatedRecords,
      localOnlyRecords: local.size,
      sameRecords,
      conflicts,
    };
  }

  private async persistProfile(session: VaultSession, vaultId: string, deviceId: UUID, profile: RuntimeProfile): Promise<void> {
    const eventId = newUuid();
    const recordEnvelope = await session.withVaultKey((key) => encryptRecord(key, profileAad(vaultId, profile), profile));
    const eventAad: RecordAad = {
      vaultId,
      recordId: eventId,
      recordType: 'profile-event',
      schemaVersion: SCHEMA_VERSION,
      recordVersion: 1,
    };
    const eventEnvelope = await session.withVaultKey((key) => encryptRecord(key, eventAad, { before: null, after: profile }));
    await this.repository.commitRecordEvent(
      vaultId,
      {
        recordId: profile.id,
        recordType: 'profile',
        updatedAt: profile.updatedAt,
        recordVersion: profile.version,
        encryptedPayload: encodeEnvelope(recordEnvelope),
      },
      {
        eventId,
        recordId: profile.id,
        recordType: 'profile',
        action: 'create' satisfies StoredEvent['action'],
        deviceId,
        deviceSeq: 1,
        createdAt: profile.updatedAt,
        encryptedPatch: encodeEnvelope(eventEnvelope),
      },
      0,
    );
  }

  private async persistEntity<T extends RuntimeEntity>(
    session: VaultSession,
    bootstrap: BootstrapMeta,
    recordType: 'account' | 'holding' | 'budget',
    entity: T,
  ): Promise<void> {
    const revision = await this.repository.getRevision(bootstrap.vaultId);
    const recordEnvelope = await session.withVaultKey((key) => encryptRecord(
      key,
      entityAad(bootstrap.vaultId, entity.id, recordType, entity.version),
      entity,
    ));
    const eventId = newUuid();
    const eventEnvelope = await session.withVaultKey((key) => encryptRecord(
      key,
      entityAad(bootstrap.vaultId, eventId, `${recordType}-event`, 1),
      { before: null, after: entity },
    ));
    await this.repository.commitRecordEvent(
      bootstrap.vaultId,
      {
        recordId: entity.id,
        recordType,
        updatedAt: entity.updatedAt,
        recordVersion: entity.version,
        encryptedPayload: encodeEnvelope(recordEnvelope),
      },
      {
        eventId,
        recordId: entity.id,
        recordType,
        action: 'create',
        deviceId: bootstrap.deviceId,
        deviceSeq: revision + 1,
        createdAt: entity.updatedAt,
        encryptedPatch: encodeEnvelope(eventEnvelope),
      },
      revision,
    );
  }

  private async decryptEntity<T>(session: VaultSession, vaultId: string, recordType: string, stored: StoredEncryptedRecord): Promise<T> {
    return session.withVaultKey((key) => decryptRecord<T>(
      key,
      entityAad(vaultId, stored.recordId, recordType, stored.recordVersion),
      decodeEnvelope(stored.encryptedPayload),
    ));
  }

  private async hydrate(): Promise<void> {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');

    const profileRecord = await this.repository.getRecord(bootstrap.profileRecordId);
    if (!profileRecord) throw new Error('Encrypted profile record is missing.');
    const profile = await session.withVaultKey((key) => decryptRecord<RuntimeProfile>(
      key,
      profileAad(bootstrap.vaultId, { id: bootstrap.profileRecordId, version: profileRecord.recordVersion }),
      decodeEnvelope(profileRecord.encryptedPayload),
    ));

    const [storedTransactions, storedAccounts, storedHoldings, storedBudgets] = await Promise.all([
      this.repository.listRecordsByType('transaction'),
      this.repository.listRecordsByType('account'),
      this.repository.listRecordsByType('holding'),
      this.repository.listRecordsByType('budget'),
    ]);
    const transactions = await Promise.all(storedTransactions.map((stored) => session.withVaultKey((key) => decryptRecord<Transaction>(
      key,
      transactionAad(bootstrap.vaultId, stored.recordId, stored.recordVersion),
      decodeEnvelope(stored.encryptedPayload),
    ))));
    const storedAccountEntities = await Promise.all(storedAccounts.map((stored) => this.decryptEntity<Account>(session, bootstrap.vaultId, 'account', stored)));
    const holdings = await Promise.all(storedHoldings.map((stored) => this.decryptEntity<Holding>(session, bootstrap.vaultId, 'holding', stored)));
    const budgets = await Promise.all(storedBudgets.map((stored) => this.decryptEntity<Budget>(session, bootstrap.vaultId, 'budget', stored)));
    const defaultAccount: Account = {
      id: bootstrap.defaultAccountId,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      version: 1,
      name: '기본 계좌',
      kind: 'checking',
      purpose: 'daily',
      openingBalanceMinor: 0,
      includeNetWorth: true,
    };
    const accounts = [defaultAccount, ...storedAccountEntities.filter((account) => account.id !== bootstrap.defaultAccountId)];
    const activeTransactions = transactions.filter((transaction) => !transaction.deletedAt);
    const analytics = selectCoreAnalytics(activeTransactions);
    const balances = balanceAccounts(accounts, activeTransactions);
    const loanAccounts = accounts.filter((account) => account.kind === 'loan');
    const loans: Loan[] = loanAccounts.map((account) => ({
      id: account.id,
      accountId: account.id,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      version: account.version,
      remainingPrincipalMinor: loanPrincipalFor(account, activeTransactions),
      annualInterestRate: 0,
    }));
    const netWorth = selectNetWorth({
      accounts,
      balances: accounts.map((account) => ({ accountId: account.id, balanceMinor: balances.get(account.id) ?? 0 })),
      holdings,
      loans,
      creditLiabilities: accounts
        .filter((account) => account.kind === 'credit')
        .map((account) => ({ accountId: account.id, outstandingMinor: Math.max(0, -(balances.get(account.id) ?? 0)) })),
    });
    const purposeAnalysis = analyzeAccountPurposes(
      accounts.filter((account) => account.kind !== 'loan' && account.kind !== 'credit'),
      accounts.map((account) => ({ accountId: account.id, balanceMinor: balances.get(account.id) ?? 0 })),
    );
    const holdingInsights = holdings.map(buildHoldingInsight);

    const nowDate = currentDate(this.options.now());
    const month = currentMonthStart(this.options.now());
    const monthBudget = budgets
      .filter((budget) => budget.month === month)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const budgetUsage = monthBudget
      ? selectBudgetUsage(monthBudget, activeTransactions.filter((transaction) => transaction.occurredAt.slice(0, 7) === month.slice(0, 7)))
      : { limitMinor: 0, usagePercent: 0, remainingMinor: 0, status: 'ok' as const };

    const createdAt = toIso(this.options.now());
    const sourceRevision = await this.repository.getRevision(bootstrap.vaultId);
    const monthReport = generateMonthlyReport({
      id: newUuid(),
      type: 'month_end',
      targetMonth: month,
      transactions: activeTransactions,
      sourceRevision,
      createdAt,
      comparisonMonths: 1,
      accountCoverage: accounts.length > 0 ? 1 : 0,
      staleValuationCount: 0,
    });
    const halfReport = generatePeriodReport({
      id: newUuid(),
      type: 'half_year',
      targetDate: nowDate,
      transactions: activeTransactions,
      sourceRevision,
      createdAt,
      comparisonMonths: 6,
      accountCoverage: accounts.length > 0 ? 1 : 0,
      staleValuationCount: 0,
    });
    const yearReport = generatePeriodReport({
      id: newUuid(),
      type: 'year_end',
      targetDate: nowDate,
      transactions: activeTransactions,
      sourceRevision,
      createdAt,
      comparisonMonths: 12,
      accountCoverage: accounts.length > 0 ? 1 : 0,
      staleValuationCount: 0,
    });
    const reportStatus = activeTransactions.length > 0 ? 'ready' as const : 'pending' as const;
    const reports: readonly ReportSummaryViewModel[] = [
      { type: 'month_end', label: '월말 리포트', periodStart: monthReport.periodStart, periodEnd: monthReport.periodEnd, netCashflowMinor: monthReport.snapshot.cashFlow.netCashflowMinor, confidence: monthReport.confidence, status: reportStatus },
      { type: 'half_year', label: '반기 리포트', periodStart: halfReport.periodStart, periodEnd: halfReport.periodEnd, netCashflowMinor: halfReport.snapshot.cashFlow.netCashflowMinor, confidence: halfReport.confidence, status: reportStatus },
      { type: 'year_end', label: '연말 리포트', periodStart: yearReport.periodStart, periodEnd: yearReport.periodEnd, netCashflowMinor: yearReport.snapshot.cashFlow.netCashflowMinor, confidence: yearReport.confidence, status: reportStatus },
    ];

    const today = nowDate;
    const todayTransactions = activeTransactions.filter((transaction) => transaction.occurredAt.slice(0, 10) === today);
    const todayExpenseMinor = todayTransactions.reduce(
      (sum, transaction) => sum + getIncomeExpenseImpact(transaction).expenseMinor,
      0,
    );

    const merchantTotals = new Map<string, number>();
    for (const transaction of activeTransactions) {
      const expense = getIncomeExpenseImpact(transaction).expenseMinor;
      if (expense <= 0 || !transaction.merchant) continue;
      merchantTotals.set(transaction.merchant, (merchantTotals.get(transaction.merchant) ?? 0) + expense);
    }
    const topMerchant = [...merchantTotals.entries()].sort((a, b) => b[1] - a[1])[0];
    const newestValuation = holdings.map((holding) => holding.priceAsOf).sort().at(-1);

    this.setSnapshot({
      access: 'unlocked',
      dashboard: {
        nickname: profile.nickname,
        periodLabel: periodLabel(this.options.now()),
        balanceMinor: analytics.netCashflowMinor,
        incomeMinor: analytics.incomeMinor,
        expenseMinor: analytics.expenseMinor,
        fixedMinor: analytics.fixedMinor,
        variableMinor: analytics.variableMinor,
        budget: {
          limitMinor: budgetUsage.limitMinor,
          usagePercent: budgetUsage.usagePercent,
          remainingMinor: budgetUsage.remainingMinor,
          status: budgetUsage.status,
        },
        report: { label: '월간 리포트', status: reportStatus },
        reports,
        transactions: activeTransactions
          .slice()
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
          .map((transaction) => ({
            id: transaction.id,
            type: transaction.type,
            amountMinor: transaction.amountMinor,
            occurredAt: transaction.occurredAt,
            memo: transaction.memo ?? '',
            merchant: transaction.merchant ?? '',
          })),
        assets: {
          netWorthMinor: netWorth.netWorthMinor,
          valuationLabel: newestValuation ? `투자 평가 기준 ${newestValuation}` : '현재 계좌 잔액 기준',
          accounts: accounts.map((account) => ({
            id: account.id,
            name: account.name,
            kind: account.kind,
            purpose: account.purpose ?? 'other',
            balanceMinor: account.kind === 'loan'
              ? -loanPrincipalFor(account, activeTransactions)
              : balances.get(account.id) ?? 0,
          })),
          holdings: holdings.map((holding, index) => ({
            id: holding.id,
            accountId: holding.accountId,
            ticker: holding.ticker,
            marketValueMinor: holding.marketValueMinor,
            unrealizedGainMinor: holdingInsights[index]!.unrealizedGainMinor,
            returnPercent: holdingInsights[index]!.returnPercent,
            reason: holdingInsights[index]!.reason,
            priceAsOf: holding.priceAsOf,
          })),
          purposes: Object.entries(purposeAnalysis.byPurpose).map(([purpose, bucket]) => ({
            purpose: purpose as AccountPurpose,
            balanceMinor: bucket.balanceMinor,
            sharePercent: bucket.sharePercent,
          })),
        },
        topMerchant: topMerchant ? { name: topMerchant[0], amountMinor: topMerchant[1] } : null,
        todayReceipt: {
          transactionCount: todayTransactions.length,
          expenseMinor: todayExpenseMinor,
        },
      },
    });
  }

  private setSnapshot(snapshot: RuntimeSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

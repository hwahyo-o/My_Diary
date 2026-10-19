import { CloudSyncClient, CloudSyncHttpError } from '../../cloud-sync/http-client';
import { deriveCloudAuthSecret, deriveCloudKek, deriveCloudRootKey } from '../../cloud-sync/key-derivation';
import { openCloudVaultSnapshot, sealCloudVaultSnapshot, sha256Hex } from '../../cloud-sync/snapshot';
import { selectAccountPurposeAnalysis } from '../../domain/analytics/account-purpose';
import { selectBudgetUsage } from '../../domain/analytics/budget';
import { selectCoreAnalytics } from '../../domain/analytics/core';
import { selectHoldingInsights } from '../../domain/analytics/holding-insights';
import type { Account } from '../../domain/accounts/types';
import type { Budget } from '../../domain/budgets/types';
import type { Holding } from '../../domain/holdings/types';
import type { Loan } from '../../domain/loans/types';
import { selectNetWorth } from '../../domain/net-worth/selectors';
import { generateMonthlyReport, generatePeriodReport } from '../../domain/reports/generator';
import { parseISODate, parseISODateTime, parseUUID, type ISODate, type ISODateTime, type UUID } from '../../domain/shared/types';
import { getIncomeExpenseImpact } from '../../domain/transactions/accounting';
import type { Transaction } from '../../domain/transactions/types';
import { quickCandidateToDraft, parseQuickInput, splitQuickEntries } from '../../features/transactions/quick-parser';
import {
  DEFAULT_CLASSIFICATION_SETTINGS,
  addCategoryKeyword,
  addIncomeKeyword,
  normalizeClassificationSettings,
  removeIncomeKeyword,
  removeCategoryKeyword,
  restoreCategoryKeywords,
  restoreIncomeKeywords,
  rulesWithClassificationSettings,
  toClassificationSettingsViewModel,
  type ClassificationSettings,
  type FixedVariableMode,
} from '../../features/transactions/classification-settings';
import { recordCorrection } from '../../features/transactions/correction-suggestions';
import { BUILTIN_CATEGORY_IDS, getBuiltinCategory } from '../../features/transactions/category-catalog';
import { TransactionLedgerService } from '../../features/transactions/transaction-service';
import { createDirectDraft } from '../../features/transactions/validation';
import { openVaultDatabase } from '../../storage/database';
import { EncryptedRepository, type StoredEncryptedRecord, type StoredEvent } from '../../storage/repository';
import { generateDeviceSecret, generateRecoveryKey, generateVaultKey } from '../../vault/key-material';
import { wrapVaultKey, unwrapVaultKey, type WrappedKeyEnvelope } from '../../vault/key-wrap';
import { deriveDeviceKek, DEFAULT_ARGON2_PARAMS, TEST_ARGON2_PARAMS, type Argon2Params } from '../../vault/pin-kdf';
import { assertStrongPin } from '../../vault/pin-policy';
import { deriveRecoveryKek } from '../../vault/recovery';
import { decryptRecord, encryptRecord, type EncryptedRecordEnvelope, type RecordAad } from '../../vault/record-crypto';
import { VaultSession } from '../../vault/session';
import type {
  QuickTransactionPreviewViewModel,
  QuickBatchPreview,
  RuntimeSnapshot,
  SaveAccountInput,
  SaveHoldingInput,
  SaveLoanInput,
  TransactionSubmission,
  UpdateTransactionInput,
} from '../ui-types';
import { emptyAnalytics, emptyAssets, emptyCalendar, emptyClassificationSettings, emptyDashboard } from '../ui-types';
import { inspectMonthlyBudgets, selectBudgetCandidateForReview } from './budget-candidates';
import { compareMonthlyBudgetSides, type BudgetSideComparison } from './budget-side-comparison';
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

interface CloudEnrollmentMeta {
  readonly accountId: string;
  readonly nickname: string;
  readonly accountSalt: Uint8Array;
  readonly cloudWrap: WrappedKeyEnvelope;
  readonly cloudRevision: number;
  readonly localRevisionAtSync: number;
}

interface StoredAccountPayload {
  readonly account: Account;
  readonly balanceMinor: number;
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
const CLOUD_META_KEY = 'cloud-enrollment-v1';
const CLASSIFICATION_SETTINGS_RECORD_ID = parseUUID('00000000-0000-4000-8000-000000000052');
const SCHEMA_VERSION = 1;
const MAX_PIN_FAILURES = 10;

function toIso(now: Date): ISODateTime {
  return parseISODateTime(now.toISOString());
}

function toKstIso(now: Date): ISODateTime {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return parseISODateTime(
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
    + `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
    + `.${pad(shifted.getUTCMilliseconds(), 3)}+09:00`,
  );
}

function newUuid(): UUID {
  return parseUUID(crypto.randomUUID());
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

function cloudWrapAad(accountId: string, vaultId: string): Uint8Array {
  return new TextEncoder().encode(`my-diary/cloud-vault-wrap/v1/${accountId}/${vaultId}`);
}

function wrapAad(vaultId: string, kind: 'device' | 'recovery'): Uint8Array {
  return new TextEncoder().encode(`my-diary/${kind}-vault-wrap/v1/${vaultId}`);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function profileAad(vaultId: string, profile: Pick<RuntimeProfile, 'id' | 'version'>): RecordAad {
  return {
    vaultId,
    recordId: profile.id,
    recordType: 'profile',
    schemaVersion: SCHEMA_VERSION,
    recordVersion: profile.version,
  };
}

function transactionAad(vaultId: string, recordId: string, recordVersion: number): RecordAad {
  return {
    vaultId,
    recordId,
    recordType: 'transaction',
    schemaVersion: SCHEMA_VERSION,
    recordVersion,
  };
}

function financeAad(
  vaultId: string,
  recordId: string,
  recordType: 'account' | 'budget' | 'holding' | 'loan' | 'classification-settings',
  recordVersion: number,
): RecordAad {
  return {
    vaultId,
    recordId,
    recordType,
    schemaVersion: SCHEMA_VERSION,
    recordVersion,
  };
}

function currentMonthStart(now: Date): ISODate {
  return parseISODate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
}

function currentHalfStart(now: Date): ISODate {
  const month = now.getMonth() + 1;
  return parseISODate(`${now.getFullYear()}-${month <= 6 ? '01' : '07'}-01`);
}

function currentYearStart(now: Date): ISODate {
  return parseISODate(`${now.getFullYear()}-01-01`);
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

function eventsEqual(a: StoredEvent, b: StoredEvent): boolean {
  return a.eventId === b.eventId
    && a.recordId === b.recordId
    && a.recordType === b.recordType
    && a.action === b.action
    && a.deviceId === b.deviceId
    && a.deviceSeq === b.deviceSeq
    && a.createdAt === b.createdAt
    && equalBytes(a.encryptedPatch, b.encryptedPatch);
}

export function reconcileEncryptedCollections(
  localRecords: readonly StoredEncryptedRecord[],
  cloudRecords: readonly StoredEncryptedRecord[],
  localEvents: readonly StoredEvent[],
  cloudEvents: readonly StoredEvent[],
): { readonly records: StoredEncryptedRecord[]; readonly events: StoredEvent[]; readonly hardConflicts: number } {
  const records = new Map(localRecords.map((record) => [record.recordId, record]));
  let hardConflicts = 0;
  for (const incoming of cloudRecords) {
    const existing = records.get(incoming.recordId);
    if (!existing) {
      records.set(incoming.recordId, incoming);
    } else if (!recordsEqual(existing, incoming)) {
      hardConflicts += 1;
    }
  }

  const events = new Map(localEvents.map((event) => [event.eventId, event]));
  for (const incoming of cloudEvents) {
    const existing = events.get(incoming.eventId);
    if (!existing) {
      events.set(incoming.eventId, incoming);
    } else if (!eventsEqual(existing, incoming)) {
      hardConflicts += 1;
    }
  }

  return {
    records: [...records.values()],
    events: [...events.values()],
    hardConflicts,
  };
}

export class BrowserRuntime {
  private session: VaultSession | null = null;
  private bootstrap: BootstrapMeta | null = null;
  private cloudMeta: CloudEnrollmentMeta | null = null;
  private cloudKek: Uint8Array | null = null;
  private cloudConflict = false;
  private cloudSyncStatus: import('../ui-types').CloudSyncStatus = 'not-connected';
  private cloudSyncInFlight: Promise<void> | null = null;
  private cloudSyncEpoch = 0;
  private classificationSettings: ClassificationSettings = DEFAULT_CLASSIFICATION_SETTINGS;
  private readonly cloudClient = new CloudSyncClient();
  private snapshot: RuntimeSnapshot = {
    access: 'onboarding',
    dashboard: emptyDashboard,
    assets: emptyAssets,
    analytics: emptyAnalytics,
    calendar: emptyCalendar,
    classificationSettings: emptyClassificationSettings,
  };
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
    runtime.cloudMeta = await repository.getSecurityMeta<CloudEnrollmentMeta>(CLOUD_META_KEY) ?? null;
    runtime.cloudSyncStatus = runtime.cloudMeta ? 'pending' : 'not-connected';
    runtime.snapshot = {
      cloudSyncStatus: runtime.cloudSyncStatus,
      access: runtime.bootstrap ? 'locked' : 'onboarding',
      dashboard: emptyDashboard,
      assets: emptyAssets,
      analytics: emptyAnalytics,
      calendar: emptyCalendar,
      classificationSettings: emptyClassificationSettings,
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

  isCloudEnrolled(): boolean {
    return this.cloudMeta !== null;
  }

  getCloudSyncStatus(): import('../ui-types').CloudSyncStatus {
    return this.cloudConflict ? 'conflict' : this.cloudSyncStatus;
  }

  private reportCloudSyncStatus(status: import('../ui-types').CloudSyncStatus): void {
    this.cloudSyncStatus = status;
    this.setSnapshot({ ...this.snapshot, cloudSyncStatus: status });
  }

  hasCloudConflict(): boolean {
    return this.cloudConflict;
  }

  async createProfile(input: { readonly nickname: string; readonly pin: string }): Promise<{ readonly recoveryKey: string }> {
    if (this.bootstrap) throw new Error('A local vault is already configured.');
    assertStrongPin(input.pin);
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
      if (this.cloudMeta) await this.authenticateAndSyncCloud(pin).catch(() => undefined);
    } catch (error) {
      this.session?.lock();
      this.session = null;
      const failedBootstrap = { ...bootstrap, failedAttempts: bootstrap.failedAttempts + 1 };
      await this.repository.putSecurityMeta(BOOTSTRAP_KEY, failedBootstrap);
      this.bootstrap = failedBootstrap;
      this.setSnapshot({
        access: 'locked',
        dashboard: emptyDashboard,
        assets: emptyAssets,
        analytics: emptyAnalytics,
      calendar: emptyCalendar,
      });
      throw error;
    } finally {
      kek.fill(0);
    }
  }

  async enrollCloud(input: { readonly pin: string }): Promise<void> {
    const bootstrap = this.bootstrap;
    const session = this.session;
    if (!bootstrap || !session?.isUnlocked) throw new Error('Vault session is locked.');
    if (this.cloudMeta) throw new Error('Cloud sync is already enabled.');
    assertStrongPin(input.pin);

    const nickname = this.snapshot.dashboard.nickname.trim();
    if (!nickname) throw new Error('Profile nickname is unavailable.');
    const accountSalt = crypto.getRandomValues(new Uint8Array(32));
    const rootKey = await deriveCloudRootKey(input.pin, accountSalt, bootstrap.argon2Params);
    const authSecret = await deriveCloudAuthSecret(rootKey, accountSalt);
    const deviceKek = await deriveDeviceKek(input.pin, bootstrap.deviceSecret, bootstrap.pinSalt, bootstrap.argon2Params);
    let vaultKey: Uint8Array | null = null;
    let cloudKek: Uint8Array | null = null;
    try {
      const registration = await this.cloudClient.register({ nickname, accountSalt, authSecret });
      const unlockPepper = CloudSyncClient.decodeBytes(registration.unlockPepper);
      cloudKek = await deriveCloudKek(rootKey, unlockPepper);
      this.cloudKek?.fill(0);
      this.cloudKek = cloudKek.slice();
      vaultKey = await unwrapVaultKey(bootstrap.wrappedDeviceVaultKey, deviceKek, wrapAad(bootstrap.vaultId, 'device'));
      const cloudWrap = await wrapVaultKey(vaultKey, cloudKek, cloudWrapAad(registration.accountId, bootstrap.vaultId));
      const initialMeta: CloudEnrollmentMeta = {
        accountId: registration.accountId,
        nickname,
        accountSalt,
        cloudWrap,
        cloudRevision: registration.revision,
        localRevisionAtSync: -1,
      };
      this.cloudMeta = initialMeta;
      await this.repository.putSecurityMeta(CLOUD_META_KEY, initialMeta);
      await this.uploadCloudSnapshot(initialMeta, registration.revision);
    } finally {
      rootKey.fill(0);
      authSecret.fill(0);
      deviceKek.fill(0);
      vaultKey?.fill(0);
      cloudKek?.fill(0);
    }
  }

  async loginFromCloud(input: { readonly nickname: string; readonly pin: string }): Promise<void> {
    if (this.bootstrap) throw new Error('Cloud login requires a fresh local device profile.');
    assertStrongPin(input.pin);
    const nickname = input.nickname.trim();
    if (!nickname) throw new TypeError('Nickname is required.');

    const challenge = await this.cloudClient.challenge(nickname);
    const accountSalt = CloudSyncClient.decodeBytes(challenge.accountSalt);
    const params = this.options.argon2Profile === 'test' ? TEST_ARGON2_PARAMS : DEFAULT_ARGON2_PARAMS;
    const rootKey = await deriveCloudRootKey(input.pin, accountSalt, params);
    const authSecret = await deriveCloudAuthSecret(rootKey, accountSalt);
    let cloudKek: Uint8Array | null = null;
    let vaultKey: Uint8Array | null = null;
    const deviceSecret = generateDeviceSecret();
    const pinSalt = crypto.getRandomValues(new Uint8Array(16));
    const deviceId = newUuid();
    const deviceKek = await deriveDeviceKek(input.pin, deviceSecret, pinSalt, params);
    try {
      const login = await this.cloudClient.loginWithSecret(nickname, authSecret);
      cloudKek = await deriveCloudKek(rootKey, CloudSyncClient.decodeBytes(login.unlockPepper));
      this.cloudKek?.fill(0);
      this.cloudKek = cloudKek.slice();

      const download = await this.cloudClient.downloadSnapshot();
      if (!download) throw new Error('Cloud Vault snapshot is missing.');
      if (await sha256Hex(download.bytes) !== download.objectSha256) throw new Error('Cloud snapshot digest mismatch.');
      const snapshot = await openCloudVaultSnapshot(download.bytes, cloudKek);
      if (snapshot.accountId !== login.accountId) throw new Error('Cloud account mismatch.');
      if (snapshot.schemaVersion > SCHEMA_VERSION) throw new Error('Cloud Vault uses a future schema version.');
      vaultKey = await unwrapVaultKey(snapshot.cloudWrap, cloudKek, cloudWrapAad(login.accountId, snapshot.vaultId));
      const wrappedDeviceVaultKey = await wrapVaultKey(vaultKey, deviceKek, wrapAad(snapshot.vaultId, 'device'));
      const bootstrap: BootstrapMeta = {
        vaultId: snapshot.vaultId,
        profileRecordId: parseUUID(snapshot.manifest.profileRecordId),
        defaultAccountId: parseUUID(snapshot.manifest.defaultAccountId),
        deviceId,
        deviceSecret,
        pinSalt,
        argon2Params: params,
        wrappedDeviceVaultKey,
        wrappedRecoveryVaultKey: snapshot.recoveryWrap,
        failedAttempts: 0,
      };
      await this.repository.replaceVaultData({
        vaultId: snapshot.vaultId,
        schemaVersion: snapshot.schemaVersion,
        revision: snapshot.manifest.revision,
        records: snapshot.records,
        events: snapshot.events,
        securityMeta: { key: BOOTSTRAP_KEY, value: bootstrap },
      });
      const cloudMeta: CloudEnrollmentMeta = {
        accountId: login.accountId,
        nickname,
        accountSalt,
        cloudWrap: snapshot.cloudWrap,
        cloudRevision: download.revision,
        localRevisionAtSync: snapshot.manifest.revision,
      };
      await this.repository.putSecurityMeta(CLOUD_META_KEY, cloudMeta);
      this.bootstrap = bootstrap;
      this.cloudMeta = cloudMeta;
      this.session = await VaultSession.unlock(vaultKey.slice());
      await this.hydrate();
    } finally {
      rootKey.fill(0);
      authSecret.fill(0);
      cloudKek?.fill(0);
      vaultKey?.fill(0);
      deviceKek.fill(0);
    }
  }

  previewQuickTransaction(text: string): QuickTransactionPreviewViewModel {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');

    const candidate = parseQuickInput(
      text.trim(),
      toKstIso(this.options.now()),
      rulesWithClassificationSettings(this.classificationSettings),
    );
    return {
      amountMinor: candidate.amountMinor ?? null,
      occurredAt: candidate.occurredAt,
      transactionType: candidate.transactionType,
      categoryId: candidate.categoryId,
      categoryLabel: getBuiltinCategory(candidate.categoryId)?.label ?? candidate.categoryId,
      fixedVariable: candidate.fixedVariable,
      needsReview: candidate.classification.needsReview,
      unresolvedAmount: candidate.unresolved.includes('amount'),
      multipleAmounts: candidate.unresolved.includes('multiple-amounts'),
    };
  }

  previewQuickBatch(text: string): QuickBatchPreview {
    const parts = splitQuickEntries(text);
    const entries = parts.map((part) => ({ ...this.previewQuickTransaction(part), text: part }));
    return {
      entries,
      valid: entries.length >= 2 && entries.length <= 20 && entries.every((entry) =>
        !entry.needsReview && !entry.unresolvedAmount && !entry.multipleAmounts && entry.amountMinor !== null),
    };
  }

  async submitTransaction(input: TransactionSubmission): Promise<void> {
    if (input.mode === 'batch') {
      const session = this.session;
      const bootstrap = this.bootstrap;
      if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');
      const preview = this.previewQuickBatch(input.text);
      const correctedEntries = input.entries;
      if (preview.entries.length < 2 || preview.entries.length > 20) throw new Error('Invalid batch size.');
      if (correctedEntries && (
        correctedEntries.length !== preview.entries.length
        || correctedEntries.some((entry, index) => entry.text !== preview.entries[index]?.text)
      )) throw new Error('Batch entries do not match the submitted text.');
      if (!correctedEntries && !preview.valid) throw new Error('Batch requires individually valid entries.');
      const rules = rulesWithClassificationSettings(this.classificationSettings);
      const now = toKstIso(this.options.now());
      const drafts = preview.entries.map((entry, index) => {
        const candidate = parseQuickInput(entry.text, now, rules);
        if (candidate.unresolved.includes('multiple-amounts')) throw new Error('Ambiguous monetary amounts.');
        const correction = correctedEntries?.[index];
        if (!correction && (candidate.unresolved.includes('amount') || candidate.classification.needsReview)) {
          throw new Error('Each batch entry requires review.');
        }
        if (!correction) return quickCandidateToDraft(candidate, { accountId: bootstrap.defaultAccountId });
        if (!Number.isSafeInteger(correction.amountMinor) || correction.amountMinor <= 0
          || !['income', 'expense'].includes(correction.transactionType)
          || !['fixed', 'variable', 'mixed'].includes(correction.fixedVariable)
          || !BUILTIN_CATEGORY_IDS.includes(correction.categoryId as (typeof BUILTIN_CATEGORY_IDS)[number])) {
          throw new TypeError('Invalid corrected batch entry.');
        }
        const correctedDate = parseISODateTime(correction.occurredAt);
        if (Number.isNaN(new Date(correctedDate).getTime())) throw new TypeError('Invalid transaction date.');
        return quickCandidateToDraft({
          ...candidate,
          amountMinor: correction.amountMinor,
          unresolved: [],
          transactionType: correction.transactionType,
          categoryId: correction.categoryId,
          fixedVariable: correction.fixedVariable,
          occurredAt: correctedDate,
        }, { accountId: bootstrap.defaultAccountId });
      });
      const service = new TransactionLedgerService({
        repository: this.repository, session, vaultId: bootstrap.vaultId,
        schemaVersion: SCHEMA_VERSION, deviceId: bootstrap.deviceId,
        newTransactionId: newUuid, newEventId: newUuid, now: () => toIso(this.options.now()),
      });
      const revision = await this.repository.getRevision(bootstrap.vaultId);
      await service.saveDraftBatch(drafts, revision);
      await this.hydrate();
      void this.syncCloudBestEffort();
      return;
    }
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');

    const now = toKstIso(this.options.now());
    let correctedObservation: { merchantText: string | undefined; categoryId: string; autoCategoryId: string } | null = null;
    const draft = input.mode === 'quick'
      ? (() => {
          const candidate = parseQuickInput(input.text, now, rulesWithClassificationSettings(this.classificationSettings));
          const correction = input.correction;
          if (candidate.unresolved.includes('multiple-amounts')) {
            throw new Error('Multiple amounts require separate Quick Add entries.');
          }
          if (candidate.classification.needsReview && !correction) {
            throw new Error('Quick input classification requires review.');
          }
          if (correction) {
            if (!BUILTIN_CATEGORY_IDS.includes(correction.categoryId as (typeof BUILTIN_CATEGORY_IDS)[number])) {
              throw new TypeError('Unknown transaction category.');
            }
            correctedObservation = { merchantText: candidate.merchantText, categoryId: correction.categoryId, autoCategoryId: candidate.categoryId };
            const corrected = {
              ...candidate,
              transactionType: correction.transactionType,
              categoryId: correction.categoryId,
              fixedVariable: correction.fixedVariable,
              occurredAt: parseISODateTime(correction.occurredAt),
            };
            return quickCandidateToDraft(corrected, { accountId: bootstrap.defaultAccountId });
          }
          return quickCandidateToDraft(candidate, { accountId: bootstrap.defaultAccountId });
        })()
      : createDirectDraft({
          type: 'expense',
          accountId: bootstrap.defaultAccountId,
          amountMinor: input.amountMinor,
          occurredAt: now,
          memo: input.memo,
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
    if (correctedObservation) {
      const nextObservations = recordCorrection(
        this.classificationSettings.correctionObservations ?? [],
        correctedObservation.merchantText,
        correctedObservation.categoryId,
        correctedObservation.autoCategoryId,
      );
      if (nextObservations.length > 0 && JSON.stringify(nextObservations) !== JSON.stringify(this.classificationSettings.correctionObservations ?? [])) {
        await this.persistClassificationSettings({ ...this.classificationSettings, correctionObservations: nextObservations });
      }
    }
    await this.hydrate();
    void this.syncCloudBestEffort();
  }

  async updateTransaction(input: UpdateTransactionInput): Promise<void> {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new TypeError('Transaction amount must be a positive safe integer.');
    }
    if (input.label.length > 500) throw new TypeError('Transaction label is too long.');

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
    await service.updateTransaction(
      parseUUID(input.id),
      {
        amountMinor: input.amountMinor,
        occurredAt: parseISODateTime(input.occurredAt),
        label: input.label,
      },
      revision,
    );
    await this.hydrate();
    void this.syncCloudBestEffort();
  }

  async deleteTransaction(id: string): Promise<void> {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');

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
    await service.deleteTransaction(parseUUID(id), revision);
    await this.hydrate();
    void this.syncCloudBestEffort();
  }

  async restoreTransaction(id: string): Promise<void> {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');

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
    await service.restoreTransaction(parseUUID(id), revision);
    await this.hydrate();
    void this.syncCloudBestEffort();
  }

  async saveFixedVariableRule(input: { readonly categoryId: string; readonly mode: FixedVariableMode }): Promise<void> {
    if (!BUILTIN_CATEGORY_IDS.includes(input.categoryId as typeof BUILTIN_CATEGORY_IDS[number]) || input.categoryId === 'uncategorized') {
      throw new TypeError('Unknown classification category.');
    }
    if (input.mode !== 'auto' && input.mode !== 'fixed' && input.mode !== 'variable') {
      throw new TypeError('Invalid fixed/variable mode.');
    }

    await this.persistClassificationSettings(normalizeClassificationSettings({
      ...this.classificationSettings,
      fixedVariableByCategory: {
        ...this.classificationSettings.fixedVariableByCategory,
        [input.categoryId]: input.mode,
      },
    }));
  }

  async addIncomeKeyword(input: { readonly keyword: string }): Promise<void> {
    await this.persistClassificationSettings(
      addIncomeKeyword(this.classificationSettings, input.keyword),
    );
  }

  async removeIncomeKeyword(input: { readonly keyword: string }): Promise<void> {
    await this.persistClassificationSettings(
      removeIncomeKeyword(this.classificationSettings, input.keyword),
    );
  }

  async restoreIncomeKeywords(): Promise<void> {
    await this.persistClassificationSettings(
      restoreIncomeKeywords(this.classificationSettings),
    );
  }

  async acceptCorrectionSuggestion(input: { readonly categoryId: string; readonly keyword: string }): Promise<void> {
    const suggestion = toClassificationSettingsViewModel(this.classificationSettings).correctionSuggestions.find(
      (item) => item.keyword === input.keyword && item.categoryId === input.categoryId,
    );
    if (!suggestion) throw new Error('Suggestion is no longer valid.');
    const next = addCategoryKeyword(this.classificationSettings, input.categoryId, input.keyword);
    await this.persistClassificationSettings({
      ...next,
      correctionObservations: (next.correctionObservations ?? []).filter((item) => item.keyword !== input.keyword),
    });
  }

  async dismissCorrectionSuggestion(input: { readonly categoryId: string; readonly keyword: string }): Promise<void> {
    await this.persistClassificationSettings({
      ...this.classificationSettings,
      correctionObservations: (this.classificationSettings.correctionObservations ?? [])
        .filter((item) => !(item.keyword === input.keyword && item.categoryId === input.categoryId)),
    });
  }

  async addCategoryKeyword(input: { readonly categoryId: string; readonly keyword: string }): Promise<void> {
    await this.persistClassificationSettings(
      addCategoryKeyword(this.classificationSettings, input.categoryId, input.keyword),
    );
  }

  async removeCategoryKeyword(input: { readonly categoryId: string; readonly keyword: string }): Promise<void> {
    await this.persistClassificationSettings(
      removeCategoryKeyword(this.classificationSettings, input.categoryId, input.keyword),
    );
  }

  async restoreCategoryKeywords(input: { readonly categoryId: string }): Promise<void> {
    await this.persistClassificationSettings(
      restoreCategoryKeywords(this.classificationSettings, input.categoryId),
    );
  }

  async resetAllData(input: { readonly pin: string }): Promise<void> {
    const bootstrap = this.bootstrap;
    const session = this.session;
    if (!bootstrap || !session?.isUnlocked) throw new Error('Vault session is locked.');

    const deviceKek = await deriveDeviceKek(input.pin, bootstrap.deviceSecret, bootstrap.pinSalt, bootstrap.argon2Params);
    let rawVaultKey: Uint8Array | null = null;
    let rootKey: Uint8Array | null = null;
    let authSecret: Uint8Array | null = null;
    try {
      rawVaultKey = await unwrapVaultKey(
        bootstrap.wrappedDeviceVaultKey,
        deviceKek,
        wrapAad(bootstrap.vaultId, 'device'),
      );

      const meta = this.cloudMeta;
      if (meta) {
        rootKey = await deriveCloudRootKey(input.pin, meta.accountSalt, bootstrap.argon2Params);
        authSecret = await deriveCloudAuthSecret(rootKey, meta.accountSalt);
        await this.cloudClient.loginWithSecret(meta.nickname, authSecret);
        await this.cloudClient.deleteAccount(authSecret);
      }

      await this.repository.clearAllData();

      this.cloudKek?.fill(0);
      this.cloudKek = null;
      this.cloudMeta = null;
      this.bootstrap = null;
      this.cloudConflict = false;
      this.classificationSettings = DEFAULT_CLASSIFICATION_SETTINGS;
      this.session?.lock();
      this.session = null;
      this.setSnapshot({
        access: 'onboarding',
        dashboard: emptyDashboard,
        assets: emptyAssets,
        analytics: emptyAnalytics,
        calendar: emptyCalendar,
        classificationSettings: emptyClassificationSettings,
      });
    } finally {
      deviceKek.fill(0);
      rawVaultKey?.fill(0);
      rootKey?.fill(0);
      authSecret?.fill(0);
    }
  }

  async saveBudget(input: { readonly limitMinor: number }): Promise<void> {
    if (!Number.isSafeInteger(input.limitMinor) || input.limitMinor < 0) {
      throw new TypeError('Budget limit must be a non-negative safe integer.');
    }
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');
    const month = currentMonthStart(this.options.now());
    const existing = await this.repository.listRecordsByType('budget');
    const priorBudgets = await Promise.all(existing.map((record) => session.withVaultKey((key) =>
      decryptRecord<Budget>(key,
        financeAad(bootstrap.vaultId, record.recordId, 'budget', record.recordVersion),
        decodeEnvelope(record.encryptedPayload)))));
    const newestInMonth = priorBudgets
      .filter((item) => item.month === month)
      .reduce((latest, item) => Math.max(latest, Date.parse(item.updatedAt)), 0);
    const nowMillis = this.options.now().getTime();
    const timestamp = toIso(new Date(Math.max(nowMillis, newestInMonth + 1)));
    const budget: Budget = {
      id: newUuid(),
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      month,
      limitMinor: input.limitMinor,
      alertPercents: [50, 80, 100],
    };
    await this.persistFinanceRecord('budget', budget.id, budget.version, budget.updatedAt, budget);
    await this.hydrate();
    void this.syncCloudBestEffort();
  }

  /** Available only after unlock; never sent to cloud as plaintext. */
  /**
   * Read-only verified cloud budget preview. No merge, local write, or upload.
   * Requires an unlocked enrolled Vault and rejects stale/mismatched snapshots.
   */
  async previewCloudBudgetComparison(): Promise<BudgetSideComparison> {
    const session = this.session;
    const bootstrap = this.bootstrap;
    const meta = this.cloudMeta;
    const cloudKek = this.cloudKek;
    if (!session?.isUnlocked || !bootstrap || !meta || !cloudKek) {
      throw new Error('Unlock the connected Vault before comparing cloud budgets.');
    }
    const epoch = this.cloudSyncEpoch;
    const [head, download, localRecords] = await Promise.all([
      this.cloudClient.getHead(),
      this.cloudClient.downloadSnapshot(),
      this.repository.listRecordsByType('budget'),
    ]);
    if (!session.isUnlocked || this.cloudSyncEpoch !== epoch || this.cloudKek !== cloudKek) {
      throw new Error('Vault changed during cloud comparison.');
    }
    if (!download || download.revision !== head.revision) {
      throw new Error('Cloud snapshot revision changed; refresh before comparing.');
    }
    if (await sha256Hex(download.bytes) !== download.objectSha256) {
      throw new Error('Cloud snapshot digest mismatch.');
    }
    const snapshot = await openCloudVaultSnapshot(download.bytes, cloudKek);
    if (!session.isUnlocked || this.cloudSyncEpoch !== epoch || this.cloudKek !== cloudKek) {
      throw new Error('Vault changed during cloud comparison.');
    }
    if (snapshot.accountId !== meta.accountId || snapshot.vaultId !== bootstrap.vaultId) {
      throw new Error('Cloud Vault identity mismatch.');
    }
    const decode = (record: StoredEncryptedRecord) => session.withVaultKey((key) =>
      decryptRecord<Budget>(key,
        financeAad(bootstrap.vaultId, record.recordId, 'budget', record.recordVersion),
        decodeEnvelope(record.encryptedPayload)));
    const [local, remote] = await Promise.all([
      Promise.all(localRecords.map(decode)),
      Promise.all(snapshot.records.filter((item) => item.recordType === 'budget').map(decode)),
    ]);
    if (!session.isUnlocked || this.cloudSyncEpoch !== epoch) {
      throw new Error('Vault changed during cloud comparison.');
    }
    return compareMonthlyBudgetSides(local, remote, currentMonthStart(this.options.now()));
  }

  async listCurrentMonthBudgetCandidates(): Promise<readonly { id: string; updatedAt: ISODateTime; limitMinor: number }[]> {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');
    const stored = await this.repository.listRecordsByType('budget');
    const budgets = await Promise.all(stored.map((record) => session.withVaultKey((key) =>
      decryptRecord<Budget>(key,
        financeAad(bootstrap.vaultId, record.recordId, 'budget', record.recordVersion),
        decodeEnvelope(record.encryptedPayload)))));
    const inspection = inspectMonthlyBudgets(budgets, currentMonthStart(this.options.now()));
    return [inspection.selected, ...inspection.alternatives]
      .filter((item): item is Budget => item !== undefined)
      .map(({ id, updatedAt, limitMinor }) => ({ id, updatedAt, limitMinor }));
  }

  /**
   * Explicitly confirm an existing current-month budget as a new immutable record.
   * Keeps all history and fails closed when the local Vault revision moves before commit.
   * UI must ask the user to confirm the choice; never call this automatically on sync.
   */
  async confirmBudgetCandidate(candidateId: string, expectedLatestId: string): Promise<void> {
    if (this.cloudConflict) throw new Error('Cloud conflict must be resolved before confirming budget.');
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');
    const month = currentMonthStart(this.options.now());
    const expectedRevision = await this.repository.getRevision(bootstrap.vaultId);
    const existing = await this.repository.listRecordsByType('budget');
    const budgets = await Promise.all(existing.map((record) => session.withVaultKey((key) =>
      decryptRecord<Budget>(key,
        financeAad(bootstrap.vaultId, record.recordId, 'budget', record.recordVersion),
        decodeEnvelope(record.encryptedPayload)))));
    const current = inspectMonthlyBudgets(budgets, month).selected;
    if (!current || current.id !== parseUUID(expectedLatestId)) {
      throw new Error('Budget candidates changed since they were displayed; reload before confirming.');
    }
    const chosen = selectBudgetCandidateForReview(budgets, month, parseUUID(candidateId));
    if (!Number.isSafeInteger(chosen.limitMinor) || chosen.limitMinor < 0) {
      throw new TypeError('Selected budget limit is invalid.');
    }
    const newestInMonth = budgets
      .filter((budget) => budget.month === month)
      .reduce((latest, budget) => Math.max(latest, Date.parse(budget.updatedAt)), 0);
    const timestamp = toIso(new Date(Math.max(this.options.now().getTime(), newestInMonth + 1)));
    const confirmed: Budget = {
      id: newUuid(),
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      month,
      limitMinor: chosen.limitMinor,
      alertPercents: [...chosen.alertPercents],
    };
    if (this.cloudConflict) throw new Error('Cloud conflict must be resolved before confirming budget.');
    await this.persistFinanceRecord('budget', confirmed.id, confirmed.version, confirmed.updatedAt, confirmed, expectedRevision);
    await this.hydrate();
    void this.syncCloudBestEffort();
  }

  async saveAccount(input: SaveAccountInput): Promise<string> {
    if (!input.name.trim()) throw new TypeError('Account name is required.');
    if (!Number.isSafeInteger(input.balanceMinor)) throw new TypeError('Account balance must be a safe integer.');
    const timestamp = toIso(this.options.now());
    const account: Account = {
      id: newUuid(),
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      name: input.name.trim(),
      kind: input.kind,
      purpose: input.purpose,
      includeNetWorth: input.includeNetWorth,
    };
    const payload: StoredAccountPayload = { account, balanceMinor: input.balanceMinor };
    await this.persistFinanceRecord('account', account.id, account.version, account.updatedAt, payload);
    await this.hydrate();
    void this.syncCloudBestEffort();
    return account.id;
  }

  async saveHolding(input: SaveHoldingInput): Promise<void> {
    const timestamp = toIso(this.options.now());
    const holding: Holding = {
      id: newUuid(),
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      accountId: parseUUID(input.accountId),
      ticker: input.ticker.trim().toUpperCase(),
      quantity: input.quantity,
      avgCostMinor: input.avgCostMinor,
      marketValueMinor: input.marketValueMinor,
      priceAsOf: parseISODate(input.priceAsOf),
    };
    if (!holding.ticker) throw new TypeError('Holding ticker is required.');
    if (!Number.isFinite(Number(holding.quantity)) || Number(holding.quantity) < 0) {
      throw new TypeError('Holding quantity must be a non-negative number.');
    }
    await this.persistFinanceRecord('holding', holding.id, holding.version, holding.updatedAt, holding);
    await this.hydrate();
    void this.syncCloudBestEffort();
  }

  async saveLoan(input: SaveLoanInput): Promise<void> {
    if (!Number.isSafeInteger(input.remainingPrincipalMinor) || input.remainingPrincipalMinor < 0) {
      throw new TypeError('Loan principal must be a non-negative safe integer.');
    }
    const timestamp = toIso(this.options.now());
    const loan: Loan = {
      id: newUuid(),
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      accountId: parseUUID(input.accountId),
      remainingPrincipalMinor: input.remainingPrincipalMinor,
      annualInterestRate: input.annualInterestRate,
    };
    await this.persistFinanceRecord('loan', loan.id, loan.version, loan.updatedAt, loan);
    await this.hydrate();
    void this.syncCloudBestEffort();
  }

  async rotateRecoveryKey(input: { readonly pin: string }): Promise<string> {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');
    const deviceKek = await deriveDeviceKek(
      input.pin, bootstrap.deviceSecret, bootstrap.pinSalt, bootstrap.argon2Params,
    );
    let vaultKey: Uint8Array | null = null;
    let newRecoveryKey: Uint8Array | null = null;
    let recoveryKek: Uint8Array | null = null;
    try {
      vaultKey = await unwrapVaultKey(
        bootstrap.wrappedDeviceVaultKey, deviceKek, wrapAad(bootstrap.vaultId, 'device'),
      );
      const profileRecord = await this.repository.getRecord(bootstrap.profileRecordId);
      if (!profileRecord) throw new Error('Encrypted profile record is missing.');
      await decryptRecord<RuntimeProfile>(
        vaultKey,
        profileAad(bootstrap.vaultId, { id: bootstrap.profileRecordId, version: profileRecord.recordVersion }),
        decodeEnvelope(profileRecord.encryptedPayload),
      );
      newRecoveryKey = generateRecoveryKey();
      recoveryKek = await deriveRecoveryKek(newRecoveryKey, bootstrap.vaultId);
      const wrappedRecoveryVaultKey = await wrapVaultKey(
        vaultKey, recoveryKek, wrapAad(bootstrap.vaultId, 'recovery'),
      );
      // Persist the new wrap before showing the key; financial records remain unchanged.
      await this.repository.putSecurityMeta(BOOTSTRAP_KEY, { ...bootstrap, wrappedRecoveryVaultKey });
      this.bootstrap = { ...bootstrap, wrappedRecoveryVaultKey };
      return toBase64Url(newRecoveryKey);
    } finally {
      deviceKek.fill(0);
      vaultKey?.fill(0);
      newRecoveryKey?.fill(0);
      recoveryKek?.fill(0);
    }
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
      void this.syncCloudBestEffort();
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
    assertStrongPin(input.pin);
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

  private async authenticateAndSyncCloud(pin: string): Promise<void> {
    const meta = this.cloudMeta;
    const bootstrap = this.bootstrap;
    if (!meta || !bootstrap) return;
    const rootKey = await deriveCloudRootKey(pin, meta.accountSalt, bootstrap.argon2Params);
    const authSecret = await deriveCloudAuthSecret(rootKey, meta.accountSalt);
    try {
      const login = await this.cloudClient.loginWithSecret(meta.nickname, authSecret);
      const cloudKek = await deriveCloudKek(rootKey, CloudSyncClient.decodeBytes(login.unlockPepper));
      try {
        this.cloudKek?.fill(0);
        this.cloudKek = cloudKek.slice();
        this.reportCloudSyncStatus('syncing');
        try {
          await this.syncCloudNow();
          this.reportCloudSyncStatus(this.cloudConflict ? 'conflict' : 'synced');
        } catch (error) {
          this.reportCloudSyncStatus(this.cloudConflict ? 'conflict' : 'error');
          throw error;
        }
      } finally {
        cloudKek.fill(0);
      }
    } finally {
      rootKey.fill(0);
      authSecret.fill(0);
    }
  }

  async retryCloudSync(): Promise<void> {
    if (!this.cloudMeta || !this.session?.isUnlocked || !this.cloudKek) {
      throw new Error('Unlock the connected Vault before retrying cloud sync.');
    }
    await this.syncCloudBestEffort();
    if (this.cloudSyncStatus === 'error' || this.cloudSyncStatus === 'conflict') {
      throw new Error('Cloud sync did not complete; local records are preserved.');
    }
  }

  private async reportVerifiedSyncStatus(): Promise<void> {
    const epoch = this.cloudSyncEpoch;
    const meta = this.cloudMeta;
    const bootstrap = this.bootstrap;
    if (!meta || !bootstrap || !this.session?.isUnlocked) return;
    const revision = await this.repository.getRevision(bootstrap.vaultId);
    if (epoch !== this.cloudSyncEpoch || !this.session?.isUnlocked) return;
    this.reportCloudSyncStatus(this.cloudConflict ? 'conflict' : revision === this.cloudMeta?.localRevisionAtSync ? 'synced' : 'pending');
  }

  private async syncCloudBestEffort(): Promise<void> {
    if (!this.cloudMeta || !this.session?.isUnlocked) return;
    if (this.cloudSyncInFlight) return this.cloudSyncInFlight;
    const startEpoch = this.cloudSyncEpoch;
    this.reportCloudSyncStatus('syncing');
    const task = (async () => {
      try {
        await this.syncCloudNow();
        if (startEpoch === this.cloudSyncEpoch) await this.reportVerifiedSyncStatus();
      } catch (error) {
        // A second device may have uploaded after our head check. Re-read the
        // newest snapshot and reconcile at most once; never blindly overwrite.
        if (error instanceof CloudSyncHttpError && error.status === 409 && this.session?.isUnlocked) {
          try {
            await this.syncCloudNow();
            if (startEpoch === this.cloudSyncEpoch) await this.reportVerifiedSyncStatus();
            return;
          } catch {
            // Preserve local records. A later unlock can retry safely.
          }
        }
        if (startEpoch === this.cloudSyncEpoch) this.reportCloudSyncStatus(this.cloudConflict ? 'conflict' : 'error');
        // Offline/auth/server errors leave the encrypted local ledger intact.
      }
    })();
    this.cloudSyncInFlight = task;
    try {
      await task;
    } finally {
      if (this.cloudSyncInFlight === task) this.cloudSyncInFlight = null;
    }
  }

  private async syncCloudNow(): Promise<void> {
    const meta = this.cloudMeta;
    const bootstrap = this.bootstrap;
    if (!meta || !bootstrap || !this.session?.isUnlocked) return;

    const epoch = this.cloudSyncEpoch;
    const assertActive = () => {
      if (epoch !== this.cloudSyncEpoch || !this.session?.isUnlocked || !this.cloudKek) {
        throw new Error('Vault locked while cloud sync was in flight.');
      }
    };
    const [head, localRevision] = await Promise.all([
      this.cloudClient.getHead(),
      this.repository.getRevision(bootstrap.vaultId),
    ]);
    assertActive();
    const localChanged = localRevision !== meta.localRevisionAtSync;
    if (head.revision < meta.cloudRevision) throw new Error('Cloud sync head moved backwards.');
    const cloudChanged = head.revision > meta.cloudRevision;

    if (cloudChanged) {
      const download = await this.cloudClient.downloadSnapshot();
      if (!download) throw new Error('Cloud Vault snapshot is missing.');
      if (await sha256Hex(download.bytes) !== download.objectSha256) throw new Error('Cloud snapshot digest mismatch.');
      const cloudKek = this.cloudKek;
      if (!cloudKek) throw new Error('Cloud sync key is unavailable.');
      const snapshot = await openCloudVaultSnapshot(download.bytes, cloudKek);
      assertActive();
      if (snapshot.accountId !== meta.accountId || snapshot.vaultId !== bootstrap.vaultId) {
        throw new Error('Cloud Vault identity mismatch.');
      }

      if (localChanged) {
        const [localRecords, localEvents] = await Promise.all([
          this.repository.listAllRecords(),
          this.repository.listAllEvents(),
        ]);
        const reconciled = reconcileEncryptedCollections(
          localRecords,
          snapshot.records,
          localEvents,
          snapshot.events,
        );
        if (reconciled.hardConflicts > 0) {
          this.cloudConflict = true;
          this.setSnapshot({ ...this.snapshot });
          throw new Error('Cloud sync contains overlapping record edits that require manual resolution.');
        }

        const mergedRevision = Math.max(localRevision, snapshot.manifest.revision) + 1;
        assertActive();
        await this.repository.replaceVaultData({
          vaultId: snapshot.vaultId,
          schemaVersion: Math.max(snapshot.schemaVersion, SCHEMA_VERSION),
          revision: mergedRevision,
          records: reconciled.records,
          events: reconciled.events,
        });
        const mergedMeta: CloudEnrollmentMeta = {
          ...meta,
          cloudWrap: snapshot.cloudWrap,
          cloudRevision: download.revision,
          localRevisionAtSync: -1,
        };
        await this.repository.putSecurityMeta(CLOUD_META_KEY, mergedMeta);
        this.cloudMeta = mergedMeta;
        this.cloudConflict = false;
        await this.hydrate();
        await this.uploadCloudSnapshot(mergedMeta, download.revision);
        return;
      }

      await this.repository.replaceVaultData({
        vaultId: snapshot.vaultId,
        schemaVersion: snapshot.schemaVersion,
        revision: snapshot.manifest.revision,
        records: snapshot.records,
        events: snapshot.events,
      });
      const nextMeta: CloudEnrollmentMeta = {
        ...meta,
        cloudWrap: snapshot.cloudWrap,
        cloudRevision: download.revision,
        localRevisionAtSync: snapshot.manifest.revision,
      };
      await this.repository.putSecurityMeta(CLOUD_META_KEY, nextMeta);
      this.cloudMeta = nextMeta;
      this.cloudConflict = false;
      await this.hydrate();
      return;
    }
    assertActive();
    if (localChanged) await this.uploadCloudSnapshot(meta, head.revision);
    this.cloudConflict = false;
  }

  private async uploadCloudSnapshot(meta: CloudEnrollmentMeta, expectedCloudRevision: number): Promise<void> {
    const bootstrap = this.bootstrap;
    if (!bootstrap || !this.session?.isUnlocked) throw new Error('Vault session is locked.');
    const syncEpoch = this.cloudSyncEpoch;
    const [records, events, localRevision] = await Promise.all([
      this.repository.listAllRecords(),
      this.repository.listAllEvents(),
      this.repository.getRevision(bootstrap.vaultId),
    ]);
    const cloudKek = this.cloudKek;
    if (!cloudKek) throw new Error('Cloud sync key is unavailable.');
    if (syncEpoch !== this.cloudSyncEpoch || !this.session?.isUnlocked) return;
    const bytes = await sealCloudVaultSnapshot({
      formatVersion: 1,
      schemaVersion: SCHEMA_VERSION,
      vaultId: bootstrap.vaultId,
      createdAt: toIso(this.options.now()),
      accountId: meta.accountId,
      manifest: {
        profileRecordId: bootstrap.profileRecordId,
        defaultAccountId: bootstrap.defaultAccountId,
        revision: localRevision,
      },
      cloudWrap: meta.cloudWrap,
      recoveryWrap: bootstrap.wrappedRecoveryVaultKey,
      records,
      events,
    }, cloudKek);
    if (syncEpoch !== this.cloudSyncEpoch || !this.session?.isUnlocked) return;
    const result = await this.cloudClient.uploadSnapshot({
      expectedRevision: expectedCloudRevision,
      objectSha256: await sha256Hex(bytes),
      bytes,
    });
    if (syncEpoch !== this.cloudSyncEpoch || !this.session?.isUnlocked) return;
    const nextMeta: CloudEnrollmentMeta = {
      ...meta,
      cloudRevision: result.revision,
      localRevisionAtSync: localRevision,
    };
    await this.repository.putSecurityMeta(CLOUD_META_KEY, nextMeta);
    this.cloudMeta = nextMeta;
  }

  lock(): void {
    if (this.cloudMeta) this.reportCloudSyncStatus('pending');
    this.cloudSyncEpoch += 1;
    this.cloudKek?.fill(0);
    this.cloudKek = null;
    this.session?.lock();
    this.session = null;
    this.setSnapshot({
      access: this.bootstrap ? 'locked' : 'onboarding',
      dashboard: emptyDashboard,
      assets: emptyAssets,
      analytics: emptyAnalytics,
      calendar: emptyCalendar,
    });
  }

  close(): void {
    this.lock();
    this.listeners.clear();
    this.db.close();
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

  private async persistClassificationSettings(nextSettings: ClassificationSettings): Promise<void> {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');

    const currentRecord = await this.repository.getRecord(CLASSIFICATION_SETTINGS_RECORD_ID);
    const normalized = normalizeClassificationSettings(nextSettings);
    const version = (currentRecord?.recordVersion ?? 0) + 1;
    const timestamp = toIso(this.options.now());
    const revision = await this.repository.getRevision(bootstrap.vaultId);
    const eventId = newUuid();
    const envelope = await session.withVaultKey((key) => encryptRecord(
      key,
      financeAad(bootstrap.vaultId, CLASSIFICATION_SETTINGS_RECORD_ID, 'classification-settings', version),
      normalized,
    ));
    const eventEnvelope = await session.withVaultKey((key) => encryptRecord(
      key,
      financeAad(bootstrap.vaultId, eventId, 'classification-settings', 1),
      { beforeVersion: currentRecord?.recordVersion ?? null, after: normalized },
    ));

    await this.repository.commitRecordEvent(
      bootstrap.vaultId,
      {
        recordId: CLASSIFICATION_SETTINGS_RECORD_ID,
        recordType: 'classification-settings',
        updatedAt: timestamp,
        recordVersion: version,
        encryptedPayload: encodeEnvelope(envelope),
      },
      {
        eventId,
        recordId: CLASSIFICATION_SETTINGS_RECORD_ID,
        recordType: 'classification-settings',
        action: currentRecord ? 'update' : 'create',
        deviceId: bootstrap.deviceId,
        deviceSeq: revision + 1,
        createdAt: timestamp,
        encryptedPatch: encodeEnvelope(eventEnvelope),
      },
      revision,
    );

    this.classificationSettings = normalized;
    await this.hydrate();
    void this.syncCloudBestEffort();
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

  private async persistFinanceRecord(
    recordType: 'account' | 'budget' | 'holding' | 'loan' | 'classification-settings',
    recordId: UUID,
    recordVersion: number,
    updatedAt: ISODateTime,
    payload: unknown,
    expectedRevision?: number,
  ): Promise<void> {
    const session = this.session;
    const bootstrap = this.bootstrap;
    if (!session?.isUnlocked || !bootstrap) throw new Error('Vault session is locked.');

    const revision = await this.repository.getRevision(bootstrap.vaultId);
    if (expectedRevision !== undefined && revision !== expectedRevision) {
      throw new Error('Budget candidates changed before confirmation; review the latest entries.');
    }
    const eventId = newUuid();
    const envelope = await session.withVaultKey((key) =>
      encryptRecord(key, financeAad(bootstrap.vaultId, recordId, recordType, recordVersion), payload));
    const eventEnvelope = await session.withVaultKey((key) =>
      encryptRecord(
        key,
        financeAad(bootstrap.vaultId, eventId, recordType, 1),
        { before: null, after: payload },
      ));

    await this.repository.commitRecordEvent(
      bootstrap.vaultId,
      {
        recordId,
        recordType,
        updatedAt,
        recordVersion,
        encryptedPayload: encodeEnvelope(envelope),
      },
      {
        eventId,
        recordId,
        recordType,
        action: 'create',
        deviceId: bootstrap.deviceId,
        deviceSeq: revision + 1,
        createdAt: updatedAt,
        encryptedPatch: encodeEnvelope(eventEnvelope),
      },
      revision,
    );
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

    const decryptByType = async <T>(recordType: 'account' | 'budget' | 'holding' | 'loan' | 'classification-settings'): Promise<T[]> => {
      const stored = await this.repository.listRecordsByType(recordType);
      return Promise.all(stored.map((record) => session.withVaultKey((key) => decryptRecord<T>(
        key,
        financeAad(bootstrap.vaultId, record.recordId, recordType, record.recordVersion),
        decodeEnvelope(record.encryptedPayload),
      ))));
    };

    const [storedTransactions, accountPayloads, budgets, holdings, loans, classificationSettingsRecords, revision] = await Promise.all([
      this.repository.listRecordsByType('transaction'),
      decryptByType<StoredAccountPayload>('account'),
      decryptByType<Budget>('budget'),
      decryptByType<Holding>('holding'),
      decryptByType<Loan>('loan'),
      decryptByType<ClassificationSettings>('classification-settings'),
      this.repository.getRevision(bootstrap.vaultId),
    ]);

    this.classificationSettings = normalizeClassificationSettings(
      classificationSettingsRecords[0] ?? DEFAULT_CLASSIFICATION_SETTINGS,
    );

    const transactions = await Promise.all(storedTransactions.map((stored) => session.withVaultKey((key) => decryptRecord<Transaction>(
      key,
      transactionAad(bootstrap.vaultId, stored.recordId, stored.recordVersion),
      decodeEnvelope(stored.encryptedPayload),
    ))));
    const activeTransactions = transactions.filter((transaction) => !transaction.deletedAt);
    const coreAnalytics = selectCoreAnalytics(activeTransactions);
    const quickTransactions = activeTransactions.filter((transaction) => transaction.source === 'quick');
    const categorizedQuickCount = quickTransactions.filter((transaction) =>
      !!transaction.categoryId && transaction.categoryId !== 'uncategorized').length;
    const classificationCoverage = {
      totalQuickCount: quickTransactions.length,
      categorizedQuickCount,
      uncategorizedQuickCount: quickTransactions.length - categorizedQuickCount,
      coveragePercent: quickTransactions.length === 0 ? 0 : Math.round(categorizedQuickCount / quickTransactions.length * 100),
      correctionObservations: (this.classificationSettings.correctionObservations ?? [])
        .reduce((total, item) => total + item.count, 0),
      pendingSuggestionCount: toClassificationSettingsViewModel(this.classificationSettings).correctionSuggestions.length,
    };
    const now = this.options.now();
    const today = parseISODate(toIso(now).slice(0, 10));
    const monthStart = currentMonthStart(now);
    const monthKey = monthStart.slice(0, 7);
    const monthTransactions = activeTransactions.filter((transaction) => transaction.occurredAt.startsWith(monthKey));

    const { selected: currentBudget } = inspectMonthlyBudgets(budgets, monthStart);
    const budgetUsage = currentBudget
      ? selectBudgetUsage(currentBudget, monthTransactions)
      : { limitMinor: 0, usagePercent: 0, remainingMinor: 0, status: 'ok' as const };

    const accounts = accountPayloads.map((payload) => payload.account);
    const balances = accountPayloads.map((payload) => ({
      accountId: payload.account.id,
      balanceMinor: payload.balanceMinor,
    }));
    const creditLiabilities = accountPayloads
      .filter((payload) => payload.account.kind === 'credit')
      .map((payload) => ({
        accountId: payload.account.id,
        outstandingMinor: Math.max(0, payload.balanceMinor),
      }));
    const netWorth = selectNetWorth({ accounts, balances, holdings, loans, creditLiabilities });
    const accountPurpose = selectAccountPurposeAnalysis(accounts, balances);
    const holdingInsights = selectHoldingInsights(holdings, today);
    const staleValuationCount = holdingInsights.filter((insight) => insight.freshness === 'stale').length;
    const accountCoverage = accounts.length === 0 ? 0 : accountPurpose.purposeCoverage;

    const reportCommon = {
      transactions: activeTransactions,
      sourceRevision: revision,
      createdAt: toIso(now),
      accountCoverage,
      staleValuationCount,
    };
    const reports = [
      generateMonthlyReport({
        ...reportCommon,
        id: newUuid(),
        type: 'month_start',
        targetMonth: monthStart,
        comparisonMonths: 3,
      }),
      generateMonthlyReport({
        ...reportCommon,
        id: newUuid(),
        type: 'month_end',
        targetMonth: monthStart,
        comparisonMonths: 3,
      }),
      generatePeriodReport({
        ...reportCommon,
        id: newUuid(),
        type: 'half_year',
        periodStart: currentHalfStart(now),
        comparisonMonths: 6,
      }),
      generatePeriodReport({
        ...reportCommon,
        id: newUuid(),
        type: 'year_end',
        periodStart: currentYearStart(now),
        comparisonMonths: 12,
      }),
    ] as const;

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

    this.setSnapshot({
      access: 'unlocked',
      dashboard: {
        nickname: profile.nickname,
        periodLabel: periodLabel(now),
        balanceMinor: coreAnalytics.netCashflowMinor,
        incomeMinor: coreAnalytics.incomeMinor,
        expenseMinor: coreAnalytics.expenseMinor,
        budget: {
          limitMinor: budgetUsage.limitMinor,
          usagePercent: budgetUsage.usagePercent,
          remainingMinor: budgetUsage.remainingMinor,
          status: budgetUsage.status,
        },
        report: { label: '월간 리포트', status: 'ready' },
        topMerchant: topMerchant ? { name: topMerchant[0], amountMinor: topMerchant[1] } : null,
        todayReceipt: {
          transactionCount: todayTransactions.length,
          expenseMinor: todayExpenseMinor,
        },
      },
      assets: {
        netWorthMinor: netWorth.netWorthMinor,
        valuationLabel: staleValuationCount > 0 ? `오래된 평가값 ${staleValuationCount}개` : '평가값 최신',
        accounts: accountPayloads.map(({ account, balanceMinor }) => ({
          id: account.id,
          name: account.name,
          kind: account.kind,
          purpose: account.purpose ?? null,
          balanceMinor,
          includeNetWorth: account.includeNetWorth,
        })),
        loans: loans.map((loan) => ({
          id: loan.id,
          accountId: loan.accountId,
          remainingPrincipalMinor: loan.remainingPrincipalMinor,
          annualInterestRate: loan.annualInterestRate,
        })),
        holdings: holdings.map((holding) => {
          const insight = holdingInsights.find((item) => item.holdingId === holding.id);
          if (!insight) throw new Error('Holding insight is missing.');
          return {
            holdingId: insight.holdingId,
            accountId: holding.accountId,
            ticker: insight.ticker,
            marketValueMinor: insight.marketValueMinor,
            unrealizedChangeMinor: insight.unrealizedChangeMinor,
            returnPercent: insight.returnPercent,
            freshness: insight.freshness,
            tone: insight.tone,
            reason: insight.reason,
          };
        }),
        accountPurpose,
      },
      analytics: {
        classificationCoverage,
        fixedMinor: coreAnalytics.fixedMinor,
        variableMinor: coreAnalytics.variableMinor,
        mixedMinor: coreAnalytics.mixedMinor,
        reports: reports.map((report) => ({
          type: report.type,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          confidence: report.confidence,
          incomeMinor: report.snapshot.cashFlow.incomeMinor,
          expenseMinor: report.snapshot.cashFlow.expenseMinor,
          netCashflowMinor: report.snapshot.cashFlow.netCashflowMinor,
        })),
      },
      calendar: {
        transactions: activeTransactions
          .slice()
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
          .map((transaction) => {
            const impact = getIncomeExpenseImpact(transaction);
            const direction = impact.incomeMinor > 0
              ? 'income' as const
              : impact.expenseMinor > 0
                ? 'expense' as const
                : 'neutral' as const;
            return {
              id: transaction.id,
              occurredAt: transaction.occurredAt,
              label: transaction.merchant ?? transaction.memo ?? transaction.categoryId ?? '거래',
              type: transaction.type,
              amountMinor: transaction.amountMinor,
              direction,
            };
          }),
      },
      classificationSettings: toClassificationSettingsViewModel(this.classificationSettings),
    });
  }
  private setSnapshot(snapshot: RuntimeSnapshot): void {
    this.snapshot = { ...snapshot, cloudSyncStatus: snapshot.cloudSyncStatus ?? this.cloudSyncStatus };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

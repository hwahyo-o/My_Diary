# Runtime Composition Implementation Plan

> **Method:** strict Red → Green → Refactor. Composition is tested through real Vault + fake IndexedDB integration where practical.

**Goal:** Connect the existing UI ports to Vault/PIN, encrypted IndexedDB, transaction services, dashboard hydration, and lock/autolock behavior without allowing React components to import storage or crypto modules directly.

## Architecture

`src/app/runtime` is the composition root. It may import Vault, Storage, Domain selectors, and Transaction services. React receives only `AppRuntimePorts` + immutable ViewModels.

## Security invariants

- PIN is never persisted.
- RecoveryKey plaintext is never persisted.
- nickname/profile data is stored only as an encrypted record, not `security_meta`.
- `security_meta` may contain local device bootstrap material: device secret, KDF salt/params, wrapped device VaultKey, wrapped recovery VaultKey, vault id, default account id, and failed-attempt counters.
- unlock derives KEK from PIN + Device Secret, unwraps VaultKey, then creates a non-extractable `VaultSession`.
- wrong PIN does not alter encrypted data.
- lock drops `VaultSession` and all decrypted in-memory transaction/profile state.
- dashboard hydration decrypts records only while the session is unlocked.
- UI does not import IndexedDB, Vault crypto, or selectors directly.

## Runtime behaviors

1. `createProfile({nickname,pin})`
   - generate VaultKey / Device Secret / RecoveryKey / KDF salt
   - derive device KEK and wrap VaultKey
   - derive recovery KEK and independently wrap VaultKey
   - persist bootstrap security metadata
   - create session
   - persist encrypted profile record
   - initialize default account id
   - return a display-safe RecoveryKey string exactly once to the UI/runtime caller

2. `unlock(pin)`
   - read security metadata
   - derive device KEK and unwrap VaultKey
   - create session
   - hydrate encrypted profile + transactions
   - reset failed-attempt counter after success

3. `submitTransaction(input)`
   - require unlocked session
   - map Quick/Direct UI input to canonical TransactionDraft
   - use `TransactionLedgerService.saveDraft()` only
   - refresh in-memory ViewModel from encrypted records after successful commit

4. `lock()` / auto-lock
   - explicit lock immediately drops Vault session + decrypted cache
   - inactivity timer triggers the same lock path
   - background visibility may trigger immediate lock through a separate event hook

## Storage extensions

- `EncryptedRepository.listRecordsByType(recordType)`
- `EncryptedRepository.getSecurityMeta(key)` / `putSecurityMeta(key,value)`

## Tests first

- onboarding persists no plaintext nickname/PIN/RecoveryKey in raw IndexedDB
- wrong PIN unlock fails and leaves data/revision unchanged
- successful unlock hydrates nickname and transaction-backed dashboard totals
- Quick and Direct UI submissions reach `TransactionLedgerService`
- lock prevents transaction submission and removes hydrated ViewModel data
- inactivity controller invokes lock once at the configured deadline

## Verification gate

- ESLint passes.
- TypeScript strict typecheck passes.
- Full Vitest suite passes.
- Production Vite build passes.
- Existing UI/domain/vault/storage/transaction/report tests remain green.

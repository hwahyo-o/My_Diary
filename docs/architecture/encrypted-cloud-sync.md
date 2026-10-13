# Encrypted cloud sync architecture

## Goal

My Diary remains local-first, but the same account can continue across browsers and devices without manually importing a `.vault` backup each time.

Manual `.vault` export/recovery remains an independent disaster-recovery path.

## Trust model

Cloudflare must never receive plaintext finance records, the raw PIN, the raw VaultKey, or the raw RecoveryKey.

Cloudflare stores only:

- account metadata required for lookup and abuse controls
- a server-side verifier derived from a client auth secret
- encrypted session metadata
- an encrypted per-account unlock pepper
- encrypted Vault sync objects and revision metadata

Plaintext finance data is decrypted only in the browser after a successful login.

## Storage split

### D1

D1 stores small relational metadata:

- accounts
- login throttling state
- sessions
- current sync revision / R2 object key / object digest
- device registrations

### R2

R2 stores opaque encrypted Vault sync packages.

The server treats Vault objects as untrusted bytes and never decrypts them.

## Authentication and key separation

The browser derives a high-cost root key from the user's 10-12 digit PIN with Argon2id and an account-specific salt.

Domain-separated keys are derived from that root:

- `authSecret`: sent to the server only for account authentication
- `cloudKek`: never sent to the server; used to unwrap the VaultKey

The server stores only a keyed verifier of `authSecret` using a Worker secret.

To make offline PIN guessing harder after a D1/R2-only leak, each account also has a high-entropy `unlockPepper`. It is encrypted at rest using a Worker master secret and is returned only after successful authentication. The browser combines the PIN-derived root key with this pepper before deriving `cloudKek`.

This keeps the server from receiving the PIN or `cloudKek`.

## Login UX

### Existing device

1. Browser finds a local device bootstrap.
2. User enters PIN.
3. Local Vault unlocks immediately.
4. Background sync checks cloud revision.
5. If cloud is newer, the encrypted cloud package is downloaded and applied.
6. If local is newer, a new encrypted cloud package is uploaded.

### New device

1. User enters nickname and PIN.
2. Client requests the account salt.
3. Client derives the root key and auth secret locally.
4. Server verifies the auth secret with throttling.
5. Server creates an HttpOnly session and returns the encrypted-account unlock pepper material.
6. Browser derives `cloudKek`, downloads the encrypted Vault package, unwraps the VaultKey, and restores a new local device bootstrap.
7. The device is now enrolled and future unlocks can use the local-first path.

## Registration / migration

Existing local-only users migrate once from an already-unlocked Vault:

1. Open Settings > Cloud sync.
2. Confirm nickname and PIN.
3. Register the cloud account.
4. Wrap the existing VaultKey for cloud access.
5. Upload the first encrypted sync package.
6. Mark the local device as enrolled.

No manual `.vault` import is needed after migration for normal use.

## Sync semantics

Each cloud snapshot has a monotonic revision.

Uploads use optimistic concurrency:

- client sends its known revision
- server accepts only when it matches the current cloud revision
- otherwise it returns a conflict

The client never silently overwrites a divergent history.

Initial implementation uses whole encrypted snapshots because the expected personal-data volume is small. A later version may sync encrypted event deltas.

## Backup vs sync

Cloud sync is for continuity and convenience.

Manual `.vault` backups remain important because they:

- survive accidental account deletion
- survive sync corruption
- survive Cloudflare account / deployment failures
- allow offline disaster recovery with a separately stored RecoveryKey

Cloud sync must never replace disaster-recovery exports.

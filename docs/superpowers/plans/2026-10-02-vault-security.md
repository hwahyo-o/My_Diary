# Vault / PIN Security Implementation Plan

> **Method:** strict Red → Green → Refactor. No production crypto code before a failing test establishes the behavior.

**Goal:** Implement T10–T13: key material generation, PIN Argon2id KDF + device wrapping, recovery wrapping + AES-GCM record crypto, and in-memory unlock/lock session lifecycle.

**Architecture:** `src/vault` owns cryptographic operations. Domain code never imports vault code. Persistence will store only encrypted envelopes and public crypto metadata. PIN is a local unlock factor, not a data-encryption key.

**Runtime:** Browser Web Crypto for AES-GCM/HKDF/randomness; bundled `hash-wasm` Argon2id for the PIN KDF. No CDN or remote runtime scripts.

## Security invariants

- VaultKey, Device Secret, RecoveryKey are independent 32-byte CSPRNG values.
- PIN is exactly six numeric digits and weak patterns are rejected.
- Device KEK = Argon2id(PIN || separator || DeviceSecret, random salt, recorded parameters).
- Production Argon2id baseline: 19 MiB memory, t=2, p=1, 32-byte output; parameters stay persisted beside the wrapped key so they can be upgraded later.
- Recovery KEK is derived from RecoveryKey with HKDF-SHA-256 and vault-specific context.
- VaultKey is wrapped separately for device unlock and recovery.
- AES-GCM uses a fresh 96-bit IV every encryption.
- Record AAD binds vaultId, recordId, recordType, schemaVersion, and recordVersion.
- Decryption must fail closed on wrong key, ciphertext tampering, or AAD mismatch.
- Unlocked VaultKey is imported as a non-extractable CryptoKey.
- Lock drops all session references; raw key buffers are zeroed best-effort after import.
- No keys, PINs, plaintext records, or ciphertext payloads are logged.

## T10 — Key material + PIN policy

**Tests first**
- Generated secret material is 32 bytes and independently random.
- Valid six-digit PIN passes.
- non-six-digit, non-numeric, repeated, and obvious sequential PINs fail.

**Implementation**
- `src/vault/key-material.ts`
- `src/vault/pin-policy.ts`

## T11 — PIN KDF + Device VaultKey wrap

**Tests first**
- Same PIN/device secret/salt/params produces same derived bytes.
- Changing PIN or device secret changes output.
- Device-wrapped VaultKey round-trips.
- Wrong PIN-derived KEK and tampered ciphertext fail.

**Implementation**
- `src/vault/pin-kdf.ts`
- `src/vault/key-wrap.ts`

## T12 — Recovery wrap + record AES-GCM

**Tests first**
- RecoveryKey can unwrap the same VaultKey independently of device PIN.
- Record encrypt/decrypt round-trips JSON data.
- Ciphertext does not contain plaintext memo bytes.
- Wrong AAD and modified ciphertext reject.

**Implementation**
- `src/vault/recovery.ts`
- `src/vault/record-crypto.ts`

## T13 — Session unlock / lock lifecycle

**Tests first**
- Session imports raw VaultKey as non-extractable.
- Input raw VaultKey bytes are zeroed after successful session creation.
- `withVaultKey` works while unlocked.
- After `lock()`, key access fails synchronously and state reports locked.

**Implementation**
- `src/vault/session.ts`
- update `src/vault/index.ts`

## Verification gate

- ESLint passes.
- TypeScript strict typecheck passes.
- Existing domain/App tests remain green.
- New vault crypto tests pass.
- Production Vite build passes with the bundled Argon2id implementation.

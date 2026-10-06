# Storage Foundation Implementation Plan

**Goal:** Implement encrypted IndexedDB persistence for T14–T15 without allowing UI/domain code to bypass the repository boundary.

**Runtime:** Native IndexedDB only. `fake-indexeddb` is test-only.

## Stores
- `vault_meta` keyPath `vaultId`
- `records` keyPath `recordId`, indexes `recordType`, `updatedAt`
- `events` keyPath `eventId`, indexes `deviceId`, `recordId`, `createdAt`
- `snapshots` keyPath `snapshotId`
- `security_meta` keyPath `key`

## Invariants
- `records` contains encrypted payload only.
- record + event + vault revision are committed in one IndexedDB transaction.
- duplicate event / write failure aborts the entire transaction.
- no UI module accesses IndexedDB directly.
- snapshots contain ciphertext only and are created before migration/import in later services.
- future schema versions fail closed.

## TDD order
1. RED: database store/index contract.
2. GREEN: native IndexedDB open/upgrade implementation.
3. RED: atomic record+event+revision and rollback.
4. GREEN: repository UnitOfWork.
5. RED: encrypted snapshot + schema guard.
6. GREEN: snapshot repository and migration boundary.
7. Verify lint, strict typecheck, full tests, production build.

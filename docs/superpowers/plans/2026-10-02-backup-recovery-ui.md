# Backup / Recovery UI + Browser File I/O Plan

> Method: strict Red → Green → Refactor.

**Goal:** Wire the encrypted backup/recovery Runtime into user-facing flows without weakening the local-first security model.

## Scope
- Settings export with RecoveryKey confirmation.
- Random `.vault` filename and browser download.
- Import file picker with size gate before reading into memory.
- Runtime preflight + diff summary before apply.
- Explicit import apply confirmation.
- Fresh-device recovery from access/onboarding flow.
- Backup status/reminder UI.

## Security invariants
- Browser file I/O handles encrypted `.vault` bytes only.
- Files over 50 MiB are rejected before `arrayBuffer()`.
- RecoveryKey inputs are cleared on success/cancel/unmount/lock.
- Import apply is never automatic after file selection.
- Fresh-device recovery requires a newly chosen PIN.
- Download filenames contain random identifiers only.
- Backup reminder metadata contains timestamps/status only.

## RED tests
1. File helper generates random `.vault` filenames and rejects oversized files before reading.
2. Settings export calls Runtime, downloads bytes, clears RecoveryKey, updates status.
3. Settings import shows diff before apply and does not apply until confirmation.
4. Fresh-device recovery sends file bytes + RecoveryKey + new PIN to Runtime.
5. Cancel/lock clears sensitive RecoveryKey fields.

## GREEN implementation
- `src/app/runtime/browser-file-io.ts`
- `src/features/backup/BackupPanel.tsx`
- `src/features/access/RecoveryFlow.tsx`
- wire `SettingsPage`, `App`, `AccessGate`
- add backup status to Runtime snapshot
- update styles

## Verification
- ESLint
- strict TypeScript
- full Vitest suite
- production Vite build

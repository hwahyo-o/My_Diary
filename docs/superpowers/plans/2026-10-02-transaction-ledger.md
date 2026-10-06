# Transaction Ledger MVP Implementation Plan

> **Method:** strict Red → Green → Refactor. Every production behavior must be introduced by a failing test first.

**Goal:** Implement T16–T21: Direct Input transaction command/service, category candidate resolution, duplicate detection, delete/restore/undo event flow, Quick Input parsing, and one shared encrypted save path.

**Architecture:** Transaction feature code lives under `src/features/transactions`. Pure parsing/resolution/deduplication stays dependency-free. `TransactionLedgerService` is the only write path and depends on `VaultSession` + `EncryptedRepository`; UI code must never write IndexedDB directly. Repository payloads remain encrypted.

## Core invariants

- Direct and Quick input both converge to one `TransactionDraft` and one `saveDraft()` path.
- Amount must be a positive safe integer in minor units.
- Transfer requires a distinct counter-account.
- Quick parser never saves automatically.
- Category resolution priority: user rule → recurring rule → merchant rule → keyword rule → fallback candidate.
- Category resolution returns a candidate; it does not silently create a persistent user rule.
- Duplicate detection never deletes automatically. High-risk duplicate requires explicit confirmation before save.
- Delete is soft-delete (`deletedAt`) and produces a new encrypted event.
- Restore produces a new event; prior events are never removed.
- Undo creates a compensating mutation/event instead of deleting history.
- Every record/event write uses the encrypted repository and optimistic vault revision.

## T16 — Direct Input + common transaction draft

**Tests first**
- rejects zero/negative/non-safe amounts
- transfer requires a different counter account
- valid Direct Input produces a canonical `TransactionDraft`

**Implementation**
- `src/features/transactions/types.ts`
- `src/features/transactions/validation.ts`

## T17 — Category resolver

**Tests first**
- user rule wins over recurring/merchant/keyword
- merchant wins over keyword when no stronger rule exists
- fallback remains an explicit candidate with low confidence

**Implementation**
- `src/features/transactions/category-resolver.ts`

## T18 — Duplicate detector

**Tests first**
- same account/type/amount/merchant/date is high risk
- partial match is medium risk
- unrelated transaction is low/no risk
- detector does not mutate/delete candidates

**Implementation**
- `src/features/transactions/duplicate-detector.ts`

## T19 — Encrypted ledger service + delete/restore/undo

**Tests first**
- save encrypts transaction + event and increments revision atomically
- high duplicate save is blocked until `confirmDuplicate=true`
- delete sets `deletedAt`, restore removes it, each mutation increments record version and revision
- undo restores previous encrypted state via a compensating event
- plaintext merchant/memo are absent from raw IndexedDB record/event payloads

**Implementation**
- extend domain `Transaction` with source/fixedVariable/deletedAt fields
- extend repository with record event listing by recordId
- `src/features/transactions/transaction-service.ts`

## T20 — Quick Input parser

**Tests first**
- `점심 만삼천` → 13,000 + food hint
- `어제 택시 18000` → previous local date + transit hint
- missing/ambiguous amount returns unresolved and cannot be saved automatically

**Implementation**
- `src/features/transactions/quick-parser.ts`

## T21 — Quick/Direct convergence

**Tests first**
- equivalent Quick and Direct drafts reach the same validation/save method
- source differs (`quick` vs `manual`) but accounting fields are identical

**Implementation**
- `src/features/transactions/index.ts`
- one `TransactionLedgerService.saveDraft()` boundary

## Verification gate

- ESLint passes.
- TypeScript strict typecheck passes.
- Full Vitest suite passes.
- Vite production build passes.
- Raw IndexedDB storage contains no plaintext merchant/memo strings.
- Existing domain/vault/storage tests stay green.

# Domain Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use test-driven development and verification before completion.

**Goal:** Implement T05–T09 as a framework-independent financial domain foundation with exact money handling, core entities, accounting invariants, a Golden Ledger fixture, and net-worth selectors.

**Architecture:** `src/domain` remains pure TypeScript and must not import React, IndexedDB, or browser APIs. Runtime validation is implemented as small dependency-free parser functions at persistence/import boundaries; calculations consume already-validated domain objects.

**Tech Stack:** TypeScript strict mode, Vitest. No new runtime dependencies.

**Spec:** T05–T09 from `46_MVP_BUILD_CHECKLIST.md` and the previously approved data-model/accounting/net-worth implementation specifications.

## Global Constraints

- Base currency is KRW.
- Monetary minor units are safe integers; no floating-point money calculations.
- Transaction `amountMinor` is positive; transaction type determines direction.
- `transfer`, `saving`, investment principal, and loan principal are not consumer expense.
- Loan interest is expense; loan principal repayment itself has net-worth effect 0.
- Investment purchase is an asset reallocation, not expense except explicit fees.
- Brokerage account balance is cash-only; holding market values are added separately.
- Credit-card outstanding and loan remaining principal are liabilities.
- Domain code must not import React, storage, vault, or UI modules.

## Review Focus

- Unsafe integer/float money input must be rejected.
- Runtime parsers must reject malformed UUID/date/entity data instead of coercing silently.
- Internal transfers must never inflate income or expense.
- Loan principal and investment buys must not be double-counted as expense or net-worth growth.
- Brokerage cash + holdings and credit/loan liabilities must not be double-counted in net worth.

---

### Task 1: T05 Common branded types and runtime validation

**Files:**
- Create: `src/domain/shared/types.ts`
- Create: `src/domain/shared/validation.ts`
- Create: `src/domain/shared/types.test.ts`

**Produces:** `UUID`, `ISODate`, `ISODateTime`, `Money`, `createMoney`, `parseUUID`, `parseISODate`, `parseISODateTime`.

- [ ] Write tests that reject float/unsafe money and malformed identifiers/dates.
- [ ] Verify RED.
- [ ] Implement minimal branded types and parsers.
- [ ] Verify GREEN.

### Task 2: T06 Core financial entities

**Files:**
- Create: `src/domain/accounts/types.ts`
- Create: `src/domain/transactions/types.ts`
- Create: `src/domain/budgets/types.ts`
- Create: `src/domain/loans/types.ts`
- Create: `src/domain/holdings/types.ts`
- Create: `src/domain/reports/types.ts`
- Create: `src/domain/events/types.ts`
- Create: `src/domain/entities.test.ts`
- Modify: `src/domain/index.ts`

**Produces:** framework-independent entity contracts with version metadata.

- [ ] Write entity-shape/runtime-boundary tests first.
- [ ] Verify RED.
- [ ] Implement minimal types/validators required by the tests.
- [ ] Verify GREEN.

### Task 3: T07 Accounting invariants

**Files:**
- Create: `src/domain/transactions/accounting.ts`
- Create: `src/domain/transactions/accounting.test.ts`

**Produces:** `getIncomeExpenseImpact(transaction)` and `getInternalMovementImpact(transaction)`.

- [ ] Test income, expense, transfer, saving, loan split, investment buy/sell fee behavior.
- [ ] Verify RED.
- [ ] Implement switch-based accounting rules.
- [ ] Verify GREEN.

### Task 4: T08 Golden Ledger fixture

**Files:**
- Create: `src/domain/test-fixtures/golden-ledger.ts`
- Create: `src/domain/test-fixtures/golden-ledger.test.ts`

**Produces:** a synthetic monthly ledger with hand-calculated expected totals.

- [ ] Add fixture assertions for income, consumer expense, savings movement, principal reduction, and investment movement.
- [ ] Verify fixture through the accounting functions.

### Task 5: T09 Net-worth selector

**Files:**
- Create: `src/domain/net-worth/selectors.ts`
- Create: `src/domain/net-worth/selectors.test.ts`
- Modify: `src/domain/index.ts`

**Produces:** `selectNetWorth()` returning assets, liabilities, and net worth.

- [ ] Test checking/savings/cash/brokerage cash, holdings, credit outstanding, loans, and excluded accounts.
- [ ] Test a loan-principal repayment scenario showing equal cash/liability reduction leaves net worth unchanged.
- [ ] Verify RED.
- [ ] Implement selector without duplicate asset/liability counting.
- [ ] Verify GREEN.

## Definition of Done

- All domain tests pass.
- Existing App smoke test still passes.
- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass in CI.
- No React/browser/storage imports exist under `src/domain`.
- No new runtime dependency is added.

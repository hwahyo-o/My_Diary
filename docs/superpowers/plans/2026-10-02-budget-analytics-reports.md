# Budget / Analytics / Report Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use test-driven development and verification before completion.

**Goal:** Implement T22–T27: budget usage/time-progress selectors, month-start budget draft context, core analytics, month-start/month-end immutable report snapshots, confidence scoring, and stale-report detection.

**Architecture:** Pure calculations live under `src/domain/analytics` and `src/domain/reports`; they consume validated `Transaction` objects and reuse `getIncomeExpenseImpact()` instead of duplicating accounting rules. Report generation creates immutable snapshot data tied to a `sourceRevision`; UI must render the snapshot rather than recomputing ledger totals.

**Tech Stack:** TypeScript strict mode + Vitest. No new runtime dependencies.

**Spec:** T22–T27 from the approved MVP checklist plus Budget Analytics and Report Generation implementation specifications.

## Global Constraints

- Budget eligible expense excludes transfer, saving, loan principal, and investment principal; loan interest and explicit fees remain expense.
- Default budget alert thresholds are 50/80/100 unless `Budget.alertPercents` overrides them.
- Time progress is local-calendar inclusive-day progress, clamped to 0–100%.
- Early depletion warning requires usage >= 50% and `usagePercent - timeProgress >= 15 percentage points`.
- Month-start draft uses the previous 3 completed months as context and never silently confirms a budget.
- Core analytics reuse domain accounting selectors; no independent UI/report formulas.
- Month-start report period is the target month with prior-3-month context; month-end period is the target month.
- Reports store `sourceRevision`; ledger revision changes mark them stale rather than silently mutating them.
- Confidence degrades for low transaction coverage, high uncategorized share, incomplete account coverage, stale valuations, or insufficient comparison months.

## T22 — Budget usage / time progress

**Tests first**
- eligible expense excludes internal/asset movements but includes loan interest and investment fees
- default and custom alert threshold status
- inclusive month progress and 0/100 clamping
- early-depletion gap rule

**Implementation**
- `src/domain/analytics/budget.ts`

## T23 — Month-start budget draft

**Tests first**
- previous 3 completed months only
- mean/median context available
- scheduled fixed expense and saving target returned separately
- suggested limit is a draft and does not mutate/persist `Budget`

**Implementation**
- `src/domain/analytics/budget-draft.ts`

## T24 — Core analytics

**Tests first**
- cashflow income/expense/net values match accounting rules
- category shares only use eligible consumer expense
- fixed/variable totals separate correctly
- deleted transactions are excluded

**Implementation**
- `src/domain/analytics/core.ts`

## T25/T26 — Report generator

**Tests first**
- month-start/month-end period resolution
- report snapshot stores metric values + `sourceRevision`
- original report remains unchanged after later ledger edits
- regenerated report uses the new revision

**Implementation**
- extend `src/domain/reports/types.ts` with immutable snapshot payload
- `src/domain/reports/generator.ts`

## T27 — Confidence / stale report

**Tests first**
- complete data scores high
- insufficient comparison history/high uncategorized/stale valuation reduce confidence
- `isReportStale(report, vaultRevision)` is true only when revisions differ

**Implementation**
- `src/domain/reports/confidence.ts`
- `src/domain/reports/stale.ts`
- update `src/domain/index.ts`

## Verification gate

- ESLint passes.
- TypeScript strict typecheck passes.
- Full Vitest suite passes.
- Production Vite build passes.
- Existing transaction/vault/storage tests remain green.
- Golden Ledger values remain unchanged.

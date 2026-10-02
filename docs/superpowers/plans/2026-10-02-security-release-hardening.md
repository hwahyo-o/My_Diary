# Security / Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current local-first PWA into a release-gated build with an explicit security-header/CSP contract, production artifact scans, cache-version checks, migration/rollback drills, and a deterministic release gate.

**Architecture:** Keep security checks as repository-local scripts that inspect the built `dist/` artifact and deployment contract without introducing a server or remote analytics. Treat CSP response headers as the preferred production control, with a static-document CSP fallback only for directives supported by `<meta http-equiv>`. Service-worker and schema migrations remain separate: the worker never mutates IndexedDB, while release scripts verify cache/version and migration compatibility before a deploy artifact is accepted.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5, Node 24, GitHub Actions.

**Spec:** Existing `docs/superpowers/plans/2026-10-02-pwa-offline-update.md` plus the repository security/storage contracts.

## Global Constraints

- No Firebase or Cloudflare services.
- No analytics, ads, remote fonts, remote JavaScript, or third-party cookies.
- Service worker must never read/write IndexedDB or finance plaintext.
- `.vault` files and finance/runtime paths must remain outside service-worker caching.
- Build/deploy artifacts must contain no secrets, RecoveryKey, PIN, fixture finance plaintext, or source maps unless explicitly approved.
- Schema migration remains application-owned and fail-closed on future schema versions.
- Rollback must not silently load an older app against an unsupported newer schema.

## Review Focus

- Static hosting that cannot set HTTP response headers must not be falsely reported as having full clickjacking/header protection.
- CSP must not break the Vite production bundle or PWA worker/manifest.
- Release artifact scanning must avoid false positives from test/docs while still scanning `dist/` strictly.
- Service-worker cache version must be explicitly release-controlled and checked for accidental reuse.
- Rollback drill must distinguish code rollback before migration from unsupported schema downgrade after migration.

---

### Task 1: Security policy contract and built-artifact scanner

**Files:**
- Create: `security/headers.json`
- Create: `scripts/verify-dist-security.mjs`
- Create: `scripts/verify-dist-security.test.ts`
- Modify: `index.html`
- Modify: `package.json`

**Interfaces:**
- Produces `npm run verify:dist-security`.
- The script exits non-zero when `dist/` contains source maps, external script/font origins, secret-like material, or a missing/unsafe CSP fallback.

- [ ] Write failing tests for safe and unsafe synthetic dist directories.
- [ ] Run the focused test and confirm RED.
- [ ] Implement the scanner and static CSP fallback.
- [ ] Run focused tests and confirm GREEN.
- [ ] Commit.

### Task 2: Service-worker release version contract

**Files:**
- Create: `scripts/verify-sw-release.mjs`
- Create: `scripts/verify-sw-release.test.ts`
- Modify: `public/sw.js`
- Modify: `package.json`

**Interfaces:**
- Produces `npm run verify:sw-release`.
- Requires a release cache token and verifies `.vault`/finance bypass patterns remain present.

- [ ] Write failing version/bypass tests.
- [ ] Confirm RED.
- [ ] Implement release token + verifier.
- [ ] Confirm GREEN.
- [ ] Commit.

### Task 3: Migration and rollback drill

**Files:**
- Create: `src/storage/migration-drill.test.ts`
- Modify only storage schema/version helpers if tests expose a missing guard.

**Interfaces:**
- Proves current schema opens normally, future schema fails closed, pre-migration snapshot remains recoverable, and an older supported runtime cannot silently open an unsupported future schema.

- [ ] Add drill tests.
- [ ] Confirm RED for any missing behavior.
- [ ] Implement only missing guard behavior.
- [ ] Confirm GREEN.
- [ ] Commit.

### Task 4: CI release gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Create: `scripts/release-gate.mjs`

**Interfaces:**
- Produces `npm run release:gate` that runs lint, strict typecheck, full tests, production build, dist security verification, and SW release verification.
- CI runs the release gate after dependency installation.

- [ ] Add a failing script contract test or invoke the missing command in CI to establish RED.
- [ ] Implement the orchestrator and CI wiring.
- [ ] Verify the full GitHub Actions job is GREEN.
- [ ] Commit and perform a final whole-branch review.

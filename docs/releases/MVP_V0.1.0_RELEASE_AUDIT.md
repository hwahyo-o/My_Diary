# MVP v0.1.0 Release Audit

Date: 2026-10-02
Repository: `hwahyo-o/My_Diary`
Release branch: `release/mvp-v0.1.0`

## Purpose

This file is the durable GitHub-side audit/rollback record for the first MVP release process. It must be updated before any final merge/deploy/branch cleanup.

## Verified release foundations

- local-first encrypted Vault and device unlock flow
- encrypted IndexedDB persistence
- `.vault` backup, inspection, import, and recovery
- transaction accounting regression rules
- budget analytics and monthly reports
- half-year and year-end report generators
- account-purpose analysis
- per-holding investment insight with reason text
- PWA cache/update lifecycle and auto-lock
- production `dist/` security scanner
- service-worker sensitive-path bypass verifier
- migration / rollback compatibility guard
- GitHub Pages project-subpath support (`/My_Diary/`)
- main-only Pages deployment workflow prepared

## Latest verified release gate before final product audit

GitHub Actions run: `36983677182`
Head SHA: `86b15b86393e0dcd1bf90cbcd9d92c419b03bce2`
Result: SUCCESS

Evidence from the run:

- 28 test files passed
- 102 tests passed
- TypeScript strict typecheck passed
- ESLint passed
- Vite production build passed
- `dist security verified (5 text artifacts scanned)`
- `service worker release verified (2026.10.02.2)`
- `release gate passed`

## Product-level blockers discovered during MVP deployment audit

These are release blockers even though the automated release gate is green:

1. **Calendar route is still a presentation placeholder.** It does not yet expose the stored encrypted transaction ledger by date.
2. **Assets route is still a presentation placeholder.** It does not yet surface real account/loan/holding/net-worth state from runtime persistence.
3. **Direct transaction entry is currently wired as expense-only in `BrowserRuntime.submitTransaction`.** The domain supports additional transaction types, but the production UI/runtime does not yet expose the minimum usable input paths for income / transfers / savings / loan / investment records.
4. **Account / holding persistence and management are not yet exposed as a usable production workflow**, so the new account-purpose and holding-insight domain services cannot yet operate on user-managed production records.
5. GitHub Pages is not yet active on the repository (`has_pages: false` observed during this audit). The prepared workflow must not be treated as a completed deployment until the Pages deployment job succeeds and the live URL is smoke-tested.

## Stop decision

**Do not merge `release/mvp-v0.1.0` to `main`, deploy, or delete feature branches while any blocker above remains.**

This is deliberate fail-closed release behavior, not a CI failure.

## Planned final merge/deploy sequence after blockers are closed

1. Run `npm run release:gate` on the final release branch SHA.
2. Create/update release PR from `release/mvp-v0.1.0` to `main` and review complete diff.
3. Merge only if the release PR is conflict-free and all checks are green.
4. Run the complete release gate again on the resulting `main` SHA.
5. Allow the main-only GitHub Pages workflow to build and deploy `dist/`.
6. Verify the deployed URL: HTML shell, manifest, service worker, app boot, onboarding/unlock, encrypted transaction save, backup/export, reload/offline shell, and no root-path 404s.
7. Record final main SHA, deployment run ID, deployed URL, and smoke-test result in this file.
8. Confirm every candidate branch to delete is reachable from `main`.
9. Delete only merged branches.

## Rollback / recovery instructions

Branch deletion does not delete commits already reachable from `main`. For additional recovery safety before cleanup:

- keep this audit file on `main`
- record each deleted branch name and its final head SHA below
- create a release tag or GitHub Release for the final MVP main SHA when supported by the release workflow/tooling
- to restore a deleted branch later, create a branch from its recorded final head SHA

### Branch cleanup ledger

_No branches have been deleted during this audit because the MVP release blockers are not yet closed._

### Final release record

- Final main SHA: **NOT YET MERGED**
- Deployment run ID: **NOT YET DEPLOYED**
- Live URL: **NOT YET DEPLOYED**
- Post-deploy smoke result: **NOT YET RUN**

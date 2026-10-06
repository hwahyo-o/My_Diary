# MVP Completion, Release Candidate, Merge & Deploy Plan

**Goal:** Close the remaining MVP gaps before integrating the stacked branch chain into `main`, then verify, deploy, smoke-test, and leave recoverable GitHub release/audit records.

## MVP completion gate

The current code is not releasable yet because:
- `half_year` and `year_end` exist in `ReportType` but only monthly report generation is implemented.
- Assets UI still contains placeholder copy instead of persisted account/holding/loan data.
- mandatory base account-purpose analysis is missing.
- mandatory per-holding investment insight + reason is missing.
- dashboard budget/report values are still runtime placeholders.

## Task 1 — Period reports
- RED tests for half-year and year-end period boundaries and immutable snapshots.
- Implement generalized report period resolution without duplicating accounting logic.

## Task 2 — Account-purpose and holding insights
- RED tests for account purpose totals/coverage and per-holding return/staleness insight + deterministic reason.
- Implement pure selectors under `src/domain/analytics`.

## Task 3 — Encrypted finance-profile runtime
- RED runtime tests for encrypted persistence/hydration of account, budget, holding and loan records.
- Add fail-closed runtime ports for saving these records.
- Derive budget, net worth, account-purpose and holding insight ViewModels from decrypted records only while unlocked.
- Keep plaintext finance data out of localStorage and service-worker cache.

## Task 4 — User-facing MVP surfaces
- RED UI tests for editing monthly budget and adding account/holding/loan entries.
- Replace Assets placeholder with actual encrypted-runtime-backed summaries and insights.
- Show report period/status and budget usage from runtime data.
- Keep finance formulas in domain selectors, not React.

## Task 5 — Release candidate hardening
- Add immutable RC manifest containing app version, git SHA, SW release id, dist SHA-256 file hashes and schema version.
- Add CI artifact generation/verification.
- Re-run full release gate and MVP acceptance tests.

## Task 6 — Integration and deployment
Only after Tasks 1–5 are green:
1. Merge stacked PRs in dependency order into `main`.
2. Run the full release gate on the merged `main` SHA.
3. Check code duplication/conflicts, unresolved TODO/placeholder markers in MVP surfaces, production artifact security, schema/rollback drills and PWA cache contract.
4. Create a recoverable annotated release record/tag for the pre-deploy main SHA and publish a GitHub Release/issue-style deployment log.
5. Deploy the exact verified main SHA with GitHub Pages workflow.
6. Smoke test the deployed URL: app boot, CSP/static assets, PWA manifest/SW, onboarding, unlock, local persistence, transaction flow, backup/export surface.
7. Only after deployed smoke tests pass, remove merged feature branches where tool support permits; otherwise document the exact branches GitHub UI should delete.
8. Preserve recovery information: merge SHAs, release SHA/tag, deployment run URL, branch→PR mapping, and rollback instructions.

## Final acceptance
- lint/typecheck/tests/build pass on main
- all mandatory MVP report/account/assets/investment functions are reachable in the app
- no known conflict/duplicate implementation or placeholder MVP UI remains
- deployed SHA equals verified main SHA
- deployment smoke test passes
- recovery/audit log is stored in GitHub

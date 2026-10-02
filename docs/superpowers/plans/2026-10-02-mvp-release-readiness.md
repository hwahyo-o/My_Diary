# MVP Release Readiness Plan

**Goal:** Close remaining mandatory MVP gaps, prove release readiness, merge the complete stack to `main`, deploy, verify the deployed app, and preserve recovery/audit information before branch cleanup.

## Mandatory product gates

- [ ] Month-start and month-end reports remain green.
- [ ] Half-year report generation works over the correct six-month period.
- [ ] Year-end report generation works over the correct calendar year.
- [ ] Base account-purpose analysis is implemented and deterministic.
- [ ] Base per-holding investment insight is implemented with a human-readable reason.
- [ ] Assets/analytics runtime view-model can surface real computed values rather than hard-coded placeholders when records exist.
- [ ] Ledger, backup/recovery, vault lock/unlock, PWA update, and offline cache regression suites remain green.

## Release candidate gates

- [ ] Release manifest identifies app version, commit, schema, and service-worker release ID.
- [ ] Production build passes the release gate.
- [ ] GitHub Pages deployment workflow exists and uses the production artifact.
- [ ] Deployment is performed from `main` only after all stacked work is merged.
- [ ] Post-deploy smoke checks verify HTML, manifest, service worker, and application shell.

## Merge / cleanup gates

- [ ] Merge complete stacked PR chain to `main` in dependency order.
- [ ] Run the full release gate again on the resulting `main` SHA.
- [ ] Record a release/audit log with pre-merge heads, final main SHA, deployment URL, verification run IDs, and rollback instructions.
- [ ] Delete only branches whose commits are reachable from `main`.
- [ ] Preserve recovery information in GitHub history/release log before any branch deletion.

## Stop conditions

Do not merge or deploy if any mandatory MVP product gate is still incomplete, any test/build/security gate fails, or the deployment target cannot be verified.

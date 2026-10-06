# My Diary MVP Release Audit — 2026-10-06

This document preserves the implementation lineage that will be integrated into `main` for the first MVP deployment.

## Stacked implementation lineage

| PR | Branch | Head SHA | Scope |
| --- | --- | --- | --- |
| #1 | `feat/t01-foundation` | `7cb5bfe36cf6b292d2f514e99e6f566873d3d75e` | T01–T04 application foundation |
| #2 | `feat/t05-domain-foundation` | `fe5fba3c56bf9846a4fa0142999f2479d65a67a2` | T05–T09 domain/accounting foundation |
| #3 | `feat/t10-vault-security` | `d696bdf6b8a56afa2ca8083994b4cd205b57afcd` | T10–T13 Vault/PIN security |
| #4 | `feat/t14-storage-foundation` | `620d0b468e3a875a9e3c7176dae718b7c8226e75` | T14–T15 encrypted IndexedDB |
| #5 | `feat/t16-transaction-ledger` | `0fa35c1a2d6643e24a0ec289b605155a91d3514f` | T16–T21 transaction ledger |
| #6 | `feat/t22-budget-report` | `15229a218ca0966eb1e60f8301aef180fce49871` | T22–T27 budget/analytics/reports |
| #7 | `feat/t28-core-ui` | `b29c536107e76330469d344b7625e88747223490` | protected core UI |
| #8 | `feat/t34-runtime-composition` | `75f389f536bba92349caaaa6353fd5d3817619b2` | encrypted browser runtime |
| #9 | `feat/t35-backup-recovery-runtime` | `83d4d461e504a19de96afe46f8b01dba7ff40b5c` | encrypted backup/recovery runtime |
| #10 | `feat/t36-backup-recovery-ui` | `fbad0c3023b214fa2364f8d5af3e4f4a58a85956` | backup/recovery UI and browser I/O |
| #11 | `feat/t37-pwa-offline-update` | `2d3ad8dd9e05974595ed19b39840e53e288c96b4` | PWA offline/update lifecycle |
| #12 | `feat/t40-security-release-hardening` | `f3d6a33c428f6cb591d33b39fa7bc7a509f6a1dd` | security and release gate hardening |

The final completion branch `feat/t41-mvp-completion` contains the complete stacked history plus:
- mandatory half-year and year-end reports
- account-purpose analysis
- per-holding investment insight with neutral reasons
- encrypted account/budget/holding/loan persistence and hydration
- user-facing MVP finance entry/report surfaces
- GitHub Pages project-path hardening
- SHA-256 release manifest generation
- verified Pages deployment and post-deploy smoke workflow

## Accounting invariants retained

- cash → saving internal transfer: direct net-worth delta 0
- stock purchase: direct net-worth delta 0 except fees
- loan principal repayment: direct net-worth delta 0
- loan interest: negative net-worth effect
- market valuation gain: positive unrealized change
- card settlement must not duplicate the original consumer expense

## Recovery procedure

If a rollback is required after branch cleanup:

1. Identify the deployed SHA from the GitHub deployment audit issue and deployed `release-manifest.json`.
2. Create a recovery branch from that SHA (the release process also creates a dedicated archive/recovery branch when possible).
3. The table above preserves every pre-integration stack head for forensic comparison or branch recreation.
4. Re-run `npm install --no-audit --no-fund` and `npm run release:gate`.
5. Do not downgrade/open a Vault whose stored schema is newer than the runtime schema; the migration guard must fail closed.
6. Restore a user's finance data only through their encrypted `.vault` package and RecoveryKey. Git history never contains user finance plaintext or RecoveryKey material.

## Release acceptance gate

Integration into `main` is allowed only after:
- lint, strict typecheck, complete Vitest suite, build, dist security scan, SW release verification, Pages path verification, and release-manifest verification pass
- no mandatory MVP placeholder remains in finance UI
- final `main` SHA passes the same gate
- deployed `release-manifest.json.commitSha` exactly equals the verified `main` SHA
- deployed HTML, manifest, service worker, and release manifest pass smoke checks

Final merge SHA, deployment run, site URL, branch cleanup results, and any hosting limitation are recorded in a GitHub release audit issue after deployment.

# My_Diary Preview cloud isolation runbook

Status (2026-11-06): **PARTIALLY CONFIGURED — do not test with production accounts**.

## Environment inventory

| Resource | Production (keep unchanged) | Preview (isolated) |
|---|---|---|
| Pages project | `my-diary` | `my-diary` Preview |
| D1 | `my-diary-sync` | `my-diary-preview-sync`, UUID `2891cb9e-08df-404b-bf8a-c75568e84dd7` (created, empty) |
| R2 | `my-diary-vaults` | **NOT CREATED** — create `my-diary-preview-vaults` |
| D1 binding | `DB` | **MISSING** — bind to Preview D1 ONLY |
| R2 binding | `VAULT_BUCKET` | **MISSING** — bind to Preview R2 ONLY |
| Secret | `AUTH_PEPPER` | **MISSING** — new, independent 32-byte base64url random secret |
| Secret | `UNLOCK_MASTER_KEY` | **MISSING** — new, independent 32-byte base64url random secret |

The Production environment has its D1/R2 bindings and secrets. Do not copy their values or bind Production storage to Preview. Never paste secrets, PINs, or RecoveryKeys into GitHub, issue comments, build logs, or chat.

## Safe implementation order

1. In Cloudflare D1, inspect the **existing** production schema definition/migration files; apply the same **schema only, with no rows** to the new `my-diary-preview-sync` D1. Confirm required `accounts`, `sessions`, `devices`, and `sync_heads` tables exist, without migrating any Production account data.
2. Create an empty R2 bucket `my-diary-preview-vaults` on the existing free tier, only if no payment is required.
3. Under Pages project `my-diary` → Settings → Preview environment → Bindings, set D1 variable `DB` to the exact **Preview** D1 UUID above, and R2 variable `VAULT_BUCKET` to the exact **Preview** R2 bucket. Do not edit Production settings.
4. Under Preview Variables and Secrets, set `AUTH_PEPPER` and `UNLOCK_MASTER_KEY` as **encrypted secrets**. Generate **distinct** fresh cryptographically random 32-byte values in base64url form for each, without exposing the values.
5. Redeploy **Preview only** from PR #188. Confirm `/release-manifest.json` commit SHA matches the PR HEAD.
6. Verify missing-binding requests fail with HTTP 503 (not a misleading wrong-PIN message), then conduct fresh-account signup and login/sync smoke tests **only** using throwaway Preview accounts. Never test with existing production account identities.
7. On a second disposable browser/device, verify round-trip encrypted Vault recovery and two-way sync. Stop upon a conflict or failed sync; retain local records and test artifacts.
8. Only after all checks pass, consider whether the Preview integration is ready. This does **not** authorize merging the PR to main or deploying Production.

## Verification checklist

- [ ] The Preview D1 schema is installed, with no Production rows copied.
- [ ] An isolated Preview R2 bucket exists.
- [ ] The Preview DB and VAULT_BUCKET bindings target only Preview resources.
- [ ] Both Preview secrets exist as independent encrypted values, without exposure.
- [ ] No extra cost or Production settings change.
- [ ] Deployed Preview manifest matches PR HEAD.
- [ ] Cloud registration succeeds with a new test nickname, with no PIN error confusion.
- [ ] Existing Preview test account login and cloud sync succeed.
- [ ] Two-device backup/recovery and offline-conflict tests pass.
- [ ] PR remains Draft until integrity and manual checks complete.

**Current confirmed:** Only the Preview D1 database was created. Everything else above remains unverified or incomplete.

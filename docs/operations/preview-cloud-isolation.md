# My_Diary Preview cloud isolation runbook

Status (2026-11-09): **PARTIALLY CONFIGURED — do not test with production accounts**.

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

1. Apply **only** the repository's existing [`cloudflare/schema.sql`](../../cloudflare/schema.sql) in the Cloudflare D1 Console for **`my-diary-preview-sync` UUID `2891cb9e-08df-404b-bf8a-c75568e84dd7`**. This schema contains `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements and no Production rows. Verify with the read-only query below. **Never run the command against `my-diary-sync` Production or copy Production table rows.**
2. Create an empty R2 bucket `my-diary-preview-vaults` on the existing free tier, only if no payment is required.
3. Under Pages project `my-diary` → Settings → Preview environment → Bindings, set D1 variable `DB` to the exact **Preview** D1 UUID above, and R2 variable `VAULT_BUCKET` to the exact **Preview** R2 bucket. Do not edit Production settings.
4. Under Preview Variables and Secrets, set `AUTH_PEPPER` and `UNLOCK_MASTER_KEY` as **encrypted secrets**. Generate **distinct** fresh cryptographically random 32-byte values in base64url form for each, without exposing the values.
5. Redeploy **Preview only** from PR #188. Confirm `/release-manifest.json` commit SHA matches the PR HEAD.
6. Verify missing-binding requests fail with HTTP 503 (not a misleading wrong-PIN message), then conduct fresh-account signup and login/sync smoke tests **only** using throwaway Preview accounts. Never test with existing production account identities.
7. On a second disposable browser/device, verify round-trip encrypted Vault recovery and two-way sync. Stop upon a conflict or failed sync; retain local records and test artifacts.
8. Only after all checks pass, consider whether the Preview integration is ready. This does **not** authorize merging the PR to main or deploying Production.

## Apply the isolated Preview schema from Windows PowerShell

The repository contains `wrangler.preview.toml`, which pins binding `DB` to the dedicated Preview UUID `2891cb9e-08df-404b-bf8a-c75568e84dd7`. It does not contain a Cloudflare token or any Production resource identifiers.

From the repository root, authenticate Wrangler with your Cloudflare account (if it is not already authenticated), then inspect the target before writing:

```powershell
npx --yes wrangler@4 d1 info DB --config wrangler.preview.toml
```

Confirm the returned database ID is exactly `2891cb9e-08df-404b-bf8a-c75568e84dd7` and the name is `my-diary-preview-sync`. If either differs, stop. Then apply only the schema file to that pinned remote database:

```powershell
npx --yes wrangler@4 d1 execute DB --remote --file cloudflare/schema.sql --config wrangler.preview.toml
```

Do not add `--yes`; review Wrangler's target confirmation. This schema uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` and does not copy or delete account rows. After it completes, run the read-only verification queries below, again with the same `--config wrangler.preview.toml`. These commands use Cloudflare's Wrangler D1 `info` and `execute` interface.

```powershell
npx --yes wrangler@4 d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('accounts','sessions','sync_heads','devices') ORDER BY name;" --config wrangler.preview.toml
npx --yes wrangler@4 d1 execute DB --remote --command "SELECT 'accounts' AS table_name, COUNT(*) AS row_count FROM accounts UNION ALL SELECT 'sessions', COUNT(*) FROM sessions UNION ALL SELECT 'sync_heads', COUNT(*) FROM sync_heads UNION ALL SELECT 'devices', COUNT(*) FROM devices;" --config wrangler.preview.toml
```

Before creating any Preview test account, expected results are the four table names and all row counts equal to `0`. The command's fixed Preview config makes the target explicit; never substitute `my-diary-sync` or remove `--config`.

## D1 schema verification (Preview only)

After applying `cloudflare/schema.sql` to the **new Preview D1**, use the following read-only query in that database's console:

```sql
SELECT name FROM sqlite_master
WHERE type = 'table'
  AND name IN ('accounts', 'sessions', 'sync_heads', 'devices')
ORDER BY name;

SELECT 'accounts' AS table_name, COUNT(*) AS row_count FROM accounts
UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
UNION ALL SELECT 'sync_heads', COUNT(*) FROM sync_heads
UNION ALL SELECT 'devices', COUNT(*) FROM devices;
```

Expected: four listed tables, all four counts equal to **0** before any test account is registered. If any row already exists, stop and identify the environment rather than deleting data. The web endpoint `/api/sync/health` must return `{"ok":true}` with HTTP 200 **only once** the Preview D1, R2, two independent secrets, and schema are all present. Until then the endpoint returns only `{"ok":false}` and HTTP 503; it contains no secret values or account identifiers.

## Preview binding and secret safety

## Generate the two Preview secrets locally (Windows PowerShell)

Only do this after the Preview settings page is open and you are ready to paste a value directly into an encrypted secret field. Run the following command once for `AUTH_PEPPER`, paste from the clipboard into that Cloudflare field, then run it again independently for `UNLOCK_MASTER_KEY`. Each run generates a distinct random 32-byte value in the base64url form expected by the app; the value is sent only to the local clipboard, never to GitHub or chat.

```powershell
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$value = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
Set-Clipboard -Value $value
[Array]::Clear($bytes, 0, $bytes.Length)
Remove-Variable bytes, value
```

Paste the first generated value into the encrypted `AUTH_PEPPER` field and the second independently generated value into encrypted `UNLOCK_MASTER_KEY`. Do not paste either value into chat, a GitHub issue/comment, a normal Pages variable, or a terminal transcript. After saving, replace the clipboard with a harmless value or clear it.

Never reuse the Production `AUTH_PEPPER` or `UNLOCK_MASTER_KEY`; both secrets must be randomly generated, separate 32-byte base64url strings. Generate independently using a local cryptographically secure generator and enter each value only into **Cloudflare Pages → my-diary → Settings → Preview → Variables and Secrets** with the encrypted-secret setting. Do not log or check the values into Git. Changes to Pages settings may require a new **Preview-only redeployment** to take effect. Do not switch the Production environment.

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

**Last verified Cloudflare state:** Preview D1 created; schema, Preview R2, bindings and secrets are not yet confirmed. Runtime now has a safe readiness endpoint and PIN-before-registration guard, but those changes require a matching Preview deployment. No Production resources were changed.

# My_Diary Preview cloud isolation runbook

Status (2026-11-10): **Preview cloud resources configured; user-reported two-way sync passes; remaining integrity checks are open. Use Preview-only disposable accounts.**

## Environment inventory

| Resource | Production (keep unchanged) | Preview (isolated) |
|---|---|---|
| Pages project | `my-diary` | `my-diary` Preview |
| D1 | `my-diary-sync` | `my-diary-preview-sync`, UUID `2891cb9e-08df-404b-bf8a-c75568e84dd7` (schema applied; initially verified empty before Preview test-account use) |
| R2 | `my-diary-vaults` | `my-diary-preview-vaults` (created, private, Standard) |
| D1 binding | `DB` | `my-diary-preview-sync` (Preview only) |
| R2 binding | `VAULT_BUCKET` | `my-diary-preview-vaults` (Preview only) |
| Secret | `AUTH_PEPPER` | Configured as encrypted Preview Secret |
| Secret | `UNLOCK_MASTER_KEY` | Configured as encrypted Preview Secret |

The Production environment has its D1/R2 bindings and secrets. Do not copy their values or bind Production storage to Preview. Never paste secrets, PINs, or RecoveryKeys into GitHub, issue comments, build logs, or chat.

## Safe implementation order

1. **Done:** applied the existing [`cloudflare/schema.sql`](../../cloudflare/schema.sql) only to Preview D1 `my-diary-preview-sync` UUID `2891cb9e-08df-404b-bf8a-c75568e84dd7`. Before testing, all four required tables existed and all four row counts were `0`. Production D1 was not touched.
2. **Done:** created the private Standard R2 bucket `my-diary-preview-vaults`; no Production bucket was used.
3. **Done:** configured Preview binding `DB` to the Preview D1 and `VAULT_BUCKET` to the Preview R2 bucket. Production settings remain separate.
4. **Done:** configured `AUTH_PEPPER` and `UNLOCK_MASTER_KEY` as encrypted Preview Secrets. Secret values are not recorded here.
5. **Done for deployed HEAD:** deployed Preview commit `b55937179342f7b3f49de24da61bf769c9dd991a`; manifest matched this SHA, and `/api/sync/health` returned HTTP 200 `{"ok":true}`.
6. **User-confirmed:** bidirectional sync works at `https://cee32e14.my-diary-2mw.pages.dev/`.
7. **Next:** on disposable Preview data, verify offline conflict preservation, retry after a failed sync, `.vault` export/import recovery, logout, and account deletion. Stop if a conflict or failed sync risks data loss; preserve test artifacts.
8. Keep the PR Draft and do not merge to main or deploy Production until code review and remaining integrity checks are complete.

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

Before creating any Preview test account, expected results are the four table names and all row counts equal to `0`. This was verified before test-account use. The command's fixed Preview config makes the target explicit; never substitute `my-diary-sync` or remove `--config`.

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

- [x] The Preview D1 schema is installed; the four tables were confirmed empty before test-account use.
- [x] An isolated private Preview R2 bucket exists.
- [x] Preview DB and VAULT_BUCKET bindings target only Preview resources.
- [x] Preview AUTH_PEPPER and UNLOCK_MASTER_KEY are configured as encrypted Secrets; values are not documented.
- [x] No Production settings or resources were changed.
- [x] Preview deployment manifest matched PR HEAD `b55937179342f7b3f49de24da61bf769c9dd991a` at `https://cee32e14.my-diary-2mw.pages.dev/`.
- [x] `/api/sync/health` returned `{"ok":true}`.
- [x] User confirmed bidirectional Preview sync works at the URL above.
- [ ] Offline conflict preservation and safe retry.
- [ ] `.vault` export/import recovery.
- [ ] Logout and account deletion flows.
- [ ] Code review; PR remains Draft until outstanding checks are complete.

**Last verified Preview state (2026-11-10):** isolated D1 schema, private R2, Preview bindings and encrypted secrets are configured. Deployed manifest matches commit `b55937179342f7b3f49de24da61bf769c9dd991a`; health is green and the user reports two-way sync success. This verifies the reported basic round-trip only; no claim is made yet about offline conflicts, retries, `.vault` recovery, logout or account deletion. Production resources and deployment remain unchanged.

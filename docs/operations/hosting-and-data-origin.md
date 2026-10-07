# Hosting and data-origin policy

## Canonical production

The canonical My Diary production origin is:

`https://my-diary-2mw.pages.dev/`

Use this origin for real financial records, PWA installation, normal unlock, backup export, and day-to-day use.

Cloudflare Pages is the production host because the live HTTP response applies the required security headers, including CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, restrictive Permissions-Policy, COOP/CORP, and HSTS.

## Recovery / verification mirror

The GitHub Pages deployment is retained as a recovery and verification mirror:

`https://hwahyo-o.github.io/My_Diary/`

It is built from the same `main` commit and is smoke-tested after deployment, but it is not the canonical origin for day-to-day finance data.

## Browser-origin isolation

The two deployments do not share browser storage.

- Cloudflare origin: `https://my-diary-2mw.pages.dev`
- GitHub Pages origin: `https://hwahyo-o.github.io`

IndexedDB, Vault bootstrap metadata, service workers, caches, and local PWA state are isolated by origin. A Vault created on one origin will not automatically appear on the other.

Do not alternate between the two origins for normal data entry. Doing so can create two independent Vault histories that look like missing data.

## Moving or recovering data

To move data between origins or to recover on a new browser/device:

1. Export an encrypted `.vault` backup from the source origin.
2. Keep the RecoveryKey separate from the backup file.
3. Open the destination origin in a fresh profile.
4. Choose Vault recovery and provide the encrypted backup, RecoveryKey, and a new strong PIN.
5. Verify accounts, transactions, budgets, holdings, loans, reports, and recent backup status before treating the destination as primary.
6. Continue normal data entry on only one canonical origin.

## Deployment roles

| Host | Role | Base path | Real finance data |
| --- | --- | --- | --- |
| Cloudflare Pages | Canonical production | `/` | Yes |
| GitHub Pages | Recovery / verification mirror | `/My_Diary/` | No, except deliberate recovery testing |

Both deployments are expected to expose the same release-manifest commit SHA for the same `main` release. Their generated HTML/JS hashes may differ because the required base paths differ.

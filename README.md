# My Diary

Local-first encrypted personal finance PWA.

## Current release state

The active release candidate is `release/mvp-v0.1.0`.

Implemented foundations include:

- React 19 + TypeScript 6 + Vite 8
- strict TypeScript, ESLint, Vitest, Testing Library
- local-first encrypted Vault with PIN unlock and separate RecoveryKey
- Argon2id-derived device KEK and AES-256-GCM record encryption
- IndexedDB ciphertext persistence and encrypted `.vault` backup / recovery
- transaction accounting rules and encrypted transaction storage
- budget analytics and month-start / month-end report generation
- mandatory half-year / year-end report generation
- account-purpose analysis and per-holding investment insight services
- onboarding / unlock, Home, Calendar, Stats, Assets, Settings UI surfaces
- PWA manifest, offline service worker, update lifecycle, auto-lock
- production security scanning and deterministic `release:gate`
- GitHub Pages project-site base-path support (`/My_Diary/`)
- main-only GitHub Pages deployment workflow

## Release gate

```bash
npm install --no-audit --no-fund
npm run release:gate
```

The release gate runs, in order:

1. ESLint
2. strict TypeScript typecheck
3. full Vitest suite
4. production Vite build
5. production `dist/` security scan
6. service-worker release verification

## Important release status

Do not treat the existence of the release workflow as proof that the MVP is ready to deploy. The release audit in `docs/releases/MVP_V0.1.0_RELEASE_AUDIT.md` records remaining product-level blockers and the exact stop conditions for merging to `main`.

## Security boundaries

- finance plaintext is not stored in `localStorage`
- PIN is not the Vault encryption key
- `.vault`, finance, backup, import/export, and runtime-sensitive paths are bypassed by the service-worker cache
- no analytics, ads, remote fonts, or remote JavaScript are required by the app
- response-header-only protections must still be verified on the final hosting platform

## Dependency direction

`app/pages/features -> domain -> vault/storage` is the intended dependency direction. Domain, Vault, and storage modules must not depend on React UI.

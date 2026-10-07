# My Diary

Local-first 암호화 개인 금융 기록 PWA입니다.

## Production

정식 운영 주소:

`https://my-diary-2mw.pages.dev/`

실제 금융 기록 입력, PWA 설치, 일반 백업/복구는 위 Cloudflare Pages 주소를 기준으로 합니다.

GitHub Pages는 복구·검증용 mirror입니다:

`https://hwahyo-o.github.io/My_Diary/`

두 주소는 같은 `main` 소스에서 배포되지만 서로 다른 browser origin이므로 IndexedDB/Vault 데이터가 자동으로 공유되지 않습니다. 일반 사용 중 두 주소를 번갈아 사용하지 마세요.

자세한 운영 정책은 `docs/operations/hosting-and-data-origin.md`를 참고하세요.

## Current capabilities

- React 19 + TypeScript + Vite
- local-first encrypted Vault backed by IndexedDB
- AES-GCM encrypted finance records and authenticated encrypted `.vault` backup/recovery
- strong new-device PIN policy with Argon2id derivation
- transactions, budgets, assets, holdings, loans, analytics and reports
- auto-lock and PWA offline/update lifecycle
- production artifact security scanning and release-manifest hashing
- protected `main` branch with required PR + CI
- Cloudflare production security headers and GitHub Pages recovery mirror
- immutable dependency lock, pinned GitHub Actions and dependency audit

## Development commands

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck
npm test
npm run build
npm run release:gate
```

## Security and data model

Finance plaintext and RecoveryKey material are not committed to Git. Runtime finance records are encrypted before IndexedDB persistence. Browser storage is origin-scoped, so moving between production/mirror origins or devices requires an encrypted `.vault` export and RecoveryKey.

Absolute security cannot be guaranteed; the project is designed to minimize risk through local-first encryption, fail-closed validation, strict CI/release gates and production response headers.

## Dependency direction

`app/pages/features -> domain -> vault/storage` is the default dependency direction. Domain, Vault and storage layers do not depend on React UI.

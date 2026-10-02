# My Diary

Local-first 개인 금융 기록 PWA의 기반 저장소입니다.

## Current tranche

`feat/t01-foundation`은 MVP 체크리스트의 T01–T04만 구현합니다.

- React + TypeScript + Vite 기반
- TypeScript strict mode
- Vitest + Testing Library smoke test
- app / pages / features / domain / vault / storage / workers 경계
- 공통 디자인 토큰
- GitHub Actions 검증 골격

금융 도메인, 암호화 Vault, IndexedDB, 거래·예산·리포트 기능은 아직 구현하지 않습니다.

## Commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

## Dependency direction

`app/pages/features -> domain -> vault/storage`를 기본 방향으로 두며, `domain`, `vault`, `storage`는 React UI에 의존하지 않습니다.

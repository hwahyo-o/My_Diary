# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use test-driven development and verification before completion.

**Goal:** Establish the first runnable, testable React + TypeScript + Vite foundation for the local-first personal finance PWA without implementing financial behavior yet.

**Architecture:** Keep the application shell thin and enforce one-way dependency boundaries: app/pages/features may depend on domain/vault/storage, while domain must remain framework-independent. This tranche creates only the foundation required by T01–T04: project bootstrap, folder boundaries, design tokens, smoke tests, and CI.

**Tech Stack:** React 19, TypeScript strict mode, Vite, Vitest, Testing Library, ESLint, GitHub Actions.

**Spec:** Conversation-approved implementation roadmap and MVP checklist (T01–T04).

## Global Constraints

- No Firebase or Cloudflare application backend.
- No analytics, ads, third-party tracking, or remote font/runtime scripts.
- No financial domain behavior in this tranche.
- TypeScript strict mode is mandatory.
- UI code must not access IndexedDB directly.
- Domain code must not import React.

## Review Focus

- Fresh install must produce a working development/build/test toolchain.
- App shell must render without financial data or persistence dependencies.
- Folder boundaries must exist before domain implementation begins.
- CSS tokens must be centralized and reusable.
- CI must fail when tests or type checks fail.

---

### Task 1: T01 Project bootstrap + RED smoke test

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/app/App.test.tsx`

**Interfaces:**
- Produces a test contract requiring an `App` component that renders the product shell heading.

- [ ] Add the failing `App` smoke test before `src/app/App.tsx` exists.
- [ ] Push and confirm CI/test failure is caused by the missing `App` module.

### Task 2: T01/T02 Minimal GREEN application shell

**Files:**
- Create: `src/app/App.tsx`
- Create: `src/app/main.tsx`
- Create: placeholder modules under `pages`, `features`, `domain`, `vault`, `storage`, `workers`.

**Interfaces:**
- `App(): JSX.Element` is the only initial application component.

- [ ] Implement only enough shell UI to satisfy the smoke test.
- [ ] Keep domain/vault/storage free of React dependencies.

### Task 3: T03 Design tokens

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`

- [ ] Add periwinkle/lavender/neutral tokens, spacing, radii, typography, focus ring variables.
- [ ] Import global styles from `main.tsx`.

### Task 4: T04 CI + project hygiene

**Files:**
- Create: `eslint.config.js`
- Create: `.gitignore`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`

- [ ] CI runs install, lint, typecheck, tests, and build.
- [ ] README documents that this branch contains foundation only.
- [ ] Verify branch checks after GREEN implementation.

## Definition of Done

- `App` smoke test passes.
- TypeScript strict check passes.
- Production build passes.
- ESLint passes.
- CI is green on `feat/t01-foundation`.
- No financial logic, persistence logic, or plaintext financial storage is introduced.

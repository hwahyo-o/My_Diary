# PWA Offline / Update Hardening Plan

> Method: strict Red → Green → Refactor.

**Goal:** Make the static local-first app reliably boot offline while ensuring the service worker never caches encrypted backup payloads, finance API/data responses, or user-specific persistence.

## Scope

- Build a dedicated service-worker bundle as `/sw.js` from TypeScript.
- Cache only same-origin static application-shell requests.
- Never cache `.vault`, non-GET requests, blob/data URLs, or runtime finance/data endpoints.
- Network-first navigation with offline app-shell fallback.
- Stale-while-revalidate for safe static assets.
- Versioned cache cleanup during activate.
- Waiting-worker update UX: detect update, surface a user-controlled action, send `SKIP_WAITING`, then reload after `controllerchange`.
- No forced reload while the user is editing.
- Registration failure is non-fatal and leaves the online app usable.
- Add regression tests for cache policy, registration/update controller behavior, and service-worker message handling.

## Security invariants

- Service worker never reads IndexedDB or localStorage.
- Service worker never receives or stores PIN, RecoveryKey, VaultKey, transactions, reports, or `.vault` bytes.
- `.vault` requests are always bypassed.
- Only same-origin `GET` requests can enter cache logic.
- Responses are cached only when successful and safe by policy.
- Update activation requires explicit user action when a waiting worker exists.
- Migration remains application/runtime owned; the service worker never mutates the finance schema.

## RED tests

1. Cache policy rejects `.vault`, non-GET, cross-origin, blob/data, and finance/data paths.
2. Cache policy allows document navigation and safe static assets.
3. Update controller reports a waiting update and sends `SKIP_WAITING` only after user confirmation.
4. Update controller reloads only after `controllerchange` following an accepted update.
5. Registration failure does not throw from bootstrap-facing registration helper.
6. Service-worker message handler calls `skipWaiting()` only for the expected message type.

## GREEN implementation

- `src/workers/cache-policy.ts`
- `src/workers/service-worker.ts`
- `src/workers/register-service-worker.ts`
- `src/features/pwa/UpdateNotice.tsx`
- App/main wiring for update state
- Vite multi-entry build output that emits `dist/sw.js`
- minimal CSS for update notice

## Verification

- ESLint
- strict TypeScript
- full Vitest suite
- production Vite build
- inspect `dist/sw.js` build output path and ensure no finance/vault payload is embedded

# Security Policy

## Supported release

The current `main`-based production release and the latest `0.1.x` release are supported for security fixes.

## Reporting a vulnerability

Please do not publish suspected exploitable vulnerabilities, RecoveryKeys, Vault files, PINs, financial records, or reproduction data containing private information in a public issue.

Prefer GitHub's private vulnerability-reporting / Security Advisory flow when it is available for this repository. If that option is unavailable, contact the repository owner through their GitHub profile and ask for a private reporting channel before sharing exploit details.

Include only the minimum information required to reproduce the issue:
- affected commit or release
- browser / platform
- affected feature
- high-level reproduction steps
- expected vs actual behavior

Never attach a real user's `.vault` backup or RecoveryKey.

## Security model

My Diary is a local-first encrypted finance PWA. Finance record payloads are encrypted before IndexedDB persistence, backups are authenticated and encrypted, and the production host applies strict response security headers.

No web application can guarantee that compromise is impossible. Security controls are intended to reduce attack surface and fail closed where practical.

## Automated security checks

The repository uses:
- required pull-request CI and a protected `main` branch
- deterministic dependency installation from `package-lock.json`
- `npm audit --audit-level=high`
- pinned GitHub Actions
- production artifact security checks
- CodeQL analysis
- dependency review on pull requests
- Dependabot updates for npm and GitHub Actions

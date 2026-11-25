# Git & Change Governance Policy (Assessment 10)

## Branching & Protection
- `main`: Production-ready, protected branch. Direct pushes disabled; requires PR + passing CI (`api-test-and-lint`, `analytics-test`, `web-test-and-lint`, `security-and-container-scan`) + `CODEOWNERS` approval for ledger/migration changes.
- `develop`: Integration branch for feature PRs (`feat/*`, `fix/*`, `chore/*`).

## Semantic Commits
All commits follow Conventional Commits:
- `feat(scope): ...`
- `fix(scope): ...`
- `chore(scope): ...`
- `docs(scope): ...`

## Migration & Ledger Review Rules
Changes under `/database/migrations/`, `apps/api/src/services/ledgerService.ts`, and `apps/analytics/app/finance_math.py` require finance/senior engineering review per `.github/CODEOWNERS`. Migrations must be forward-only and idempotent (`IF NOT EXISTS`).

## Hotfix Workflow
1. Branch `hotfix/<issue>` from latest release tag on `main` (e.g., `v1.0.0`).
2. Add a regression test reproducing the defect.
3. Implement minimal fix, verify all CI checks pass.
4. Merge via PR to `main`, tag `v1.0.1`, and cherry-pick back to `develop`.

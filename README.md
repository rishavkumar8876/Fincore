# FinCore — Simulated Digital Wallet, Ledger & Payment Platform

> **DISCLAIMER**: FinCore is an educational sandbox application. All balances, transfers, payment intents, webhooks, and email/SMS notifications are **simulated** using synthetic data. Never process real money or real banking credentials.

## Architecture Overview
- **Frontend (`apps/web`)**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Redux Toolkit, Vitest + React Testing Library.
- **Core API (`apps/api`)**: Node.js, Express, TypeScript, PostgreSQL (`pg`), Redis (`ioredis`), Zod, JWT + RBAC (5 roles), Jest + Supertest.
- **Analytics & Financial Math (`apps/analytics`)**: Python 3.12, FastAPI, Pydantic, `Decimal` exact arithmetic, pytest + httpx.
- **Database (`database/`)**: PostgreSQL 16 with double-entry ledger, immutability triggers, row-level locking, and encrypted backup/restore scripts.
- **DevOps (`docker-compose.yml`, `.github/workflows/ci.yml`, `infra/nginx/`)**: Non-root Docker containers, private DB network, Nginx reverse proxy, and GitHub Actions CI/CD.

## Quick Start (Local Development)

### Prerequisites
- Node.js 22+
- Python 3.12+
- PostgreSQL 16 & Redis 7 (or Docker Desktop)

### 1. Environment Setup
```bash
cp .env.example .env
```

### 2. Run with Docker Compose
```bash
docker compose up --build
```
Services:
- Web UI: `http://localhost:3000` (or `http://localhost` via Nginx)
- Core API: `http://localhost:4000/health`
- Analytics Service: `http://localhost:8000/health`

### 3. Manual Local Run & Migrations
```bash
# Database migrations & synthetic seed
cd apps/api
npm install
npm run migrate
npm run seed
npm run dev

# Python Analytics service
cd apps/analytics
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/uvicorn app.main:app --port 8000

# Next.js Frontend
cd apps/web
npm install
npm run dev
```

### 4. Synthetic Demo Accounts
All seeded accounts use password: `FinCore!Demo2026`
- `alice.customer@fincore.sim` (`customer`) — Wallet `FC-1001-0001` ($2,500.00 simulated)
- `bob.customer@fincore.sim` (`customer`) — Wallet `FC-1001-0002` ($1,200.00 simulated)
- `support@fincore.sim` (`support_agent`)
- `analyst@fincore.sim` (`operations_analyst`)
- `finance@fincore.sim` (`finance_admin`)
- `admin@fincore.sim` (`platform_admin`)

## Running Automated Tests
```bash
# 1. Core API & Ledger Tests (Jest + Supertest)
cd apps/api && npm run lint && npm test

# 2. Python Math & Risk Analytics Tests (pytest)
cd apps/analytics && .venv/Scripts/python -m pytest -v

# 3. Frontend Component & Validation Tests (Vitest + RTL)
cd apps/web && npm run lint && npm test
```

## Mandatory Assessments Coverage (01–15)
| # | Assessment | Implementation Location |
|---|---|---|
| 01 | Financial customer frontend | [apps/web/src/app/page.tsx](apps/web/src/app/page.tsx), [apps/web/src/app/ops/page.tsx](apps/web/src/app/ops/page.tsx) |
| 02 | Financial REST APIs | [apps/api/src/routes/](apps/api/src/routes/) |
| 03 | Double-entry ledger database | [database/migrations/001_initial_schema.sql](database/migrations/001_initial_schema.sql), [002_ledger_triggers_and_indexes.sql](database/migrations/002_ledger_triggers_and_indexes.sql) |
| 04 | Financial identity & authorization | [apps/api/src/routes/auth.routes.ts](apps/api/src/routes/auth.routes.ts), [apps/api/src/middleware/auth.ts](apps/api/src/middleware/auth.ts) |
| 05 | Python financial calculations | [apps/analytics/app/finance_math.py](apps/analytics/app/finance_math.py) |
| 06 | FastAPI risk analytics | [apps/analytics/app/risk_engine.py](apps/analytics/app/risk_engine.py) |
| 07 | Transfer consistency engine | [apps/api/src/services/ledgerService.ts](apps/api/src/services/ledgerService.ts) |
| 08 | Payment & notification integrations | [apps/api/src/routes/payments.routes.ts](apps/api/src/routes/payments.routes.ts), [notificationService.ts](apps/api/src/services/notificationService.ts) |
| 09 | Containerized financial stack | [docker-compose.yml](docker-compose.yml), Dockerfiles in `apps/*/` |
| 10 | Git & change governance | [.github/CODEOWNERS](.github/CODEOWNERS), [GIT_AND_CHANGE_GOVERNANCE.md](docs/governance/GIT_AND_CHANGE_GOVERNANCE.md) |
| 11 | Secure financial CI/CD | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| 12 | Ledger & payment testing | [apps/api/tests/](apps/api/tests/), [apps/analytics/tests/](apps/analytics/tests/) |
| 13 | Financial API contracts | [docs/api/openapi.yaml](docs/api/openapi.yaml), [fincore.postman_collection.json](docs/api/fincore.postman_collection.json) |
| 14 | Secure deployment & recovery | [infra/nginx/nginx.conf](infra/nginx/nginx.conf), [database/scripts/](database/scripts/) |
| 15 | Financial incident simulation | [docs/incidents/INCIDENT_SIMULATION_RUNBOOK.md](docs/incidents/INCIDENT_SIMULATION_RUNBOOK.md) |

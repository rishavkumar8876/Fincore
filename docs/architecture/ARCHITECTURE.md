# FinCore Architecture & Data Model

## 1. System Architecture

```mermaid
flowchart LR
    Client["Browser / Next.js 15 App (Port 3000)"] -->|HTTPS / Reverse Proxy| Nginx["Nginx Proxy (Port 80/443)"]
    Nginx -->|/api/*| API["Node.js / Express Core API (Port 4000)"]
    Nginx -->|/| Client
    API -->|SQL + Row Locks| PG[("PostgreSQL 16 (System of Record)")]
    API -->|Cache / Rate Limit| Redis[("Redis 7")]
    API -->|HTTP JSON / 3s Timeout| Analytics["Python FastAPI Math & Risk Service (Port 8000)"]
```

## 2. Service Boundaries & Data Ownership

- **PostgreSQL (`database/migrations/`)**: Single system of record for users, accounts, transactions, immutable `ledger_entries`, holds, payment intents, webhook events, settlements, disputes, risk alerts, notifications, and immutable `audit_logs`.
- **Core API (`apps/api`)**: Owns authentication, RBAC (5 roles), input validation, idempotency, double-entry transfer consistency, webhook HMAC verification, and audit trail recording.
- **Analytics & Math Service (`apps/analytics`)**: Stateless Python/FastAPI service owning exact `Decimal` fee/interest/statement/reconciliation math and decision-support velocity/risk scoring.
- **Frontend (`apps/web`)**: Next.js App Router UI with Redux Toolkit state management. Never trusted for security or balance enforcement.

## 3. Concurrency Control & Ledger Invariants

- **Pessimistic Row-Level Locking**: `ledgerService.ts` locks all involved `accounts` rows using `SELECT ... FOR UPDATE` inside a PostgreSQL transaction.
- **Deadlock Prevention**: Account UUIDs are sorted lexicographically before acquiring `FOR UPDATE` locks, guaranteeing a consistent global lock acquisition order across concurrent transfers.
- **Idempotency**: Every mutating financial endpoint requires an `Idempotency-Key` header enforced by a `UNIQUE` constraint on `transactions.idempotency_key` and checked inside the transaction.
- **Database-Level Invariants**:
  - `chk_wallet_non_negative` prevents negative wallet balances.
  - `trg_ledger_entries_immutable` & `trg_audit_logs_immutable` block `UPDATE` and `DELETE`.
  - `assert_transaction_balanced(tx_id)` verifies `SUM(DEBIT) == SUM(CREDIT)` before commit.

## 4. Database ER Diagram

```mermaid
erDiagram
    USERS ||--o{ ACCOUNTS : owns
    USERS ||--o{ BENEFICIARIES : saves
    USERS ||--o{ DISPUTES : raises
    USERS ||--o{ RISK_ALERTS : triggers
    ACCOUNTS ||--o{ LEDGER_ENTRIES : records
    TRANSACTIONS ||--|{ LEDGER_ENTRIES : contains
    TRANSACTIONS ||--o{ HOLDS : places
    TRANSACTIONS ||--o{ DISPUTES : referenced_by
    PAYMENT_INTENTS }o--|| ACCOUNTS : credits
```

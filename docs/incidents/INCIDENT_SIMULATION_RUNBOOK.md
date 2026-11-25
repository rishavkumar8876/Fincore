# FinCore Financial Incident Simulation & Recovery Runbook (Assessment 15)

## Scenario 1: Duplicate Payment Webhook Replay
- **Symptom**: Payment provider retries `payment_intent.succeeded` webhook (`evt_replay_1`) 3 times due to network timeout.
- **Root Cause**: Network blip caused provider to not receive `200 OK` on first delivery.
- **Detection**: `webhook_events.event_id` UNIQUE constraint + structured log `ignored_duplicate`.
- **Corrective Action & Proof**: `POST /api/v1/payments/webhooks/sandbox` inserts with `ON CONFLICT (event_id) DO NOTHING`, returning `{ status: "ignored_duplicate" }` on retries without calling `executeSandboxDeposit` again. Verified in `apps/api/tests/api.test.ts`.

## Scenario 2: Unbalanced Ledger Attempt
- **Symptom**: Simulated code bug or manual SQL attempts to insert a single-sided `DEBIT` without a matching `CREDIT`.
- **Root Cause**: Missing offsetting entry in transaction.
- **Containment**: `assert_transaction_balanced(tx_id)` raises `Unbalanced ledger entries for transaction ...`, triggering `ROLLBACK` in `withTransaction()`.
- **Proof of Recovery**: `SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING SUM(CASE WHEN entry_type='DEBIT' THEN amount ELSE -amount END) <> 0;` returns 0 rows.

## Scenario 3: Mismatched Provider Settlement
- **Symptom**: Provider batch `BATCH-2026-01` reports `$95.00` settled vs `$100.00` expected.
- **Root Cause**: Provider fee deduction or missing intent in settlement file.
- **Resolution**: `POST /api/v1/calc/reconcile` (FastAPI) flags `status: "mismatched"`, `net_discrepancy: "-5.00"`, and lists exact `provider_intent_id` discrepancies for `finance_admin` review in `settlements`.

## Scenario 4: High Velocity / Suspicious Activity Spike
- **Symptom**: Customer executes >10 transfers in 1 hour with 5x baseline amount to a new beneficiary.
- **Detection**: FastAPI `/api/v1/risk/score` returns `risk_score: 95.0`, `severity: "critical"`, `should_flag: true`, creating a `risk_alerts` row.
- **Policy**: Operations analyst reviews the alert in `/ops` (remembering risk scores are decision support, not proof of fraud) and freezes wallet via `PATCH /api/v1/wallets/:id/status` if confirmed.

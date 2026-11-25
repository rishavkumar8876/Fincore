-- Migration 001: Initial FinCore Double-Entry Ledger & Domain Schema
-- Assessment 03: Double-entry ledger database

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users & RBAC (5 roles)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    role VARCHAR(32) NOT NULL CHECK (
        role IN ('customer', 'support_agent', 'operations_analyst', 'finance_admin', 'platform_admin')
    ),
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret_hash VARCHAR(255),
    kyc_status VARCHAR(24) NOT NULL DEFAULT 'verified' CHECK (
        kyc_status IN ('pending', 'verified', 'rejected')
    ),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Refresh Tokens (Revocable JWT sessions)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Sensitive-Action Re-authentication Tokens
CREATE TABLE IF NOT EXISTS reauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    action_scope VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Accounts (Customer Wallets & System Ledger Accounts)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    account_number VARCHAR(32) NOT NULL UNIQUE,
    account_type VARCHAR(32) NOT NULL CHECK (
        account_type IN ('wallet', 'system_settlement', 'system_fee', 'system_escrow', 'system_suspense')
    ),
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    available_balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'frozen', 'closed')
    ),
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_wallet_non_negative CHECK (
        account_type != 'wallet' OR (balance >= 0 AND available_balance >= 0)
    ),
    CONSTRAINT chk_available_lte_balance CHECK (
        account_type != 'wallet' OR available_balance <= balance
    )
);

-- 5. Beneficiaries
CREATE TABLE IF NOT EXISTS beneficiaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    account_number VARCHAR(32) NOT NULL,
    bank_code VARCHAR(32) NOT NULL DEFAULT 'FINCORE',
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, account_number)
);

-- 6. Transactions (State Machine & Idempotency)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    reference VARCHAR(64) NOT NULL UNIQUE,
    type VARCHAR(32) NOT NULL CHECK (
        type IN ('transfer', 'deposit', 'withdrawal', 'payment_intent', 'refund', 'reversal', 'fee', 'settlement')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'processing', 'completed', 'failed', 'reversed')
    ),
    source_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    destination_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    fee_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (fee_amount >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    parent_transaction_id UUID REFERENCES transactions(id) ON DELETE RESTRICT,
    created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Immutable Double-Entry Ledger Entries
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    balance_after NUMERIC(18, 4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Holds (Pending authorization / escrow holds)
CREATE TABLE IF NOT EXISTS holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'captured', 'released', 'expired')
    ),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Payment Intents (Sandbox Provider)
CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    provider VARCHAR(32) NOT NULL DEFAULT 'sandbox_pay',
    provider_intent_id VARCHAR(128) UNIQUE,
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(32) NOT NULL DEFAULT 'requires_confirmation' CHECK (
        status IN ('requires_confirmation', 'processing', 'succeeded', 'failed', 'refunded', 'disputed')
    ),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Webhook Events (Deduplication & Reconciliation)
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(32) NOT NULL,
    event_id VARCHAR(128) NOT NULL UNIQUE,
    event_type VARCHAR(64) NOT NULL,
    signature_valid BOOLEAN NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'received' CHECK (
        status IN ('received', 'processed', 'ignored_duplicate', 'failed')
    ),
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Settlements & Reconciliation
CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_reference VARCHAR(64) NOT NULL UNIQUE,
    provider VARCHAR(32) NOT NULL DEFAULT 'sandbox_pay',
    expected_amount NUMERIC(18, 4) NOT NULL,
    settled_amount NUMERIC(18, 4) NOT NULL,
    discrepancy_amount NUMERIC(18, 4) GENERATED ALWAYS AS (settled_amount - expected_amount) STORED,
    status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'matched', 'mismatched', 'resolved')
    ),
    reconciled_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Disputes
CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (
        status IN ('open', 'under_review', 'resolved_refunded', 'resolved_rejected')
    ),
    assigned_to UUID REFERENCES users(id) ON DELETE RESTRICT,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Risk Alerts (Decision Support)
CREATE TABLE IF NOT EXISTS risk_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    transaction_id UUID REFERENCES transactions(id) ON DELETE RESTRICT,
    alert_type VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    risk_score NUMERIC(5, 2) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    factors JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (
        status IN ('open', 'acknowledged', 'resolved_false_positive', 'escalated')
    ),
    reviewed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Sandbox Notifications (Email / SMS Simulation)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    channel VARCHAR(24) NOT NULL CHECK (channel IN ('email_sandbox', 'sms_sandbox')),
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    body TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
    provider_message_id VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Immutable Audit Trail
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(32),
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128),
    ip_address VARCHAR(64),
    request_id VARCHAR(64),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

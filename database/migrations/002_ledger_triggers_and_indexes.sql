-- Migration 002: Immutability Triggers, Indexes & Ledger Balance Verification

-- Prevent UPDATE or DELETE on immutable ledger_entries and audit_logs
CREATE OR REPLACE FUNCTION prevent_immutable_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Modification or deletion of % records is prohibited for financial audit integrity', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_entries_immutable ON ledger_entries;
CREATE TRIGGER trg_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_modification();

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_modification();

-- Function to assert double-entry balance for a transaction (SUM(DEBIT) = SUM(CREDIT))
CREATE OR REPLACE FUNCTION assert_transaction_balanced(p_tx_id UUID)
RETURNS VOID AS $$
DECLARE
    v_debits NUMERIC(18, 4);
    v_credits NUMERIC(18, 4);
BEGIN
    SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0)
    INTO v_debits, v_credits
    FROM ledger_entries
    WHERE transaction_id = p_tx_id;

    IF v_debits = 0 AND v_credits = 0 THEN
        RAISE EXCEPTION 'Transaction % has no ledger entries', p_tx_id;
    END IF;

    IF v_debits <> v_credits THEN
        RAISE EXCEPTION 'Unbalanced ledger entries for transaction %: debits=%, credits=%', p_tx_id, v_debits, v_credits;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Performance Indexes for measured query patterns
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_dest ON transactions(destination_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status_created ON transactions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx_id ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_created ON ledger_entries(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_alerts_status_severity ON risk_alerts(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

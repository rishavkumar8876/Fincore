-- Seed 001: Core System Ledger Accounts (Double-Entry Counterparties)
INSERT INTO accounts (id, user_id, account_number, account_type, currency, balance, available_balance, status)
VALUES
    ('00000000-0000-0000-0000-000000000001', NULL, 'SYS-SETTLEMENT-USD', 'system_settlement', 'USD', 0.0000, 0.0000, 'active'),
    ('00000000-0000-0000-0000-000000000002', NULL, 'SYS-FEE-USD',        'system_fee',        'USD', 0.0000, 0.0000, 'active'),
    ('00000000-0000-0000-0000-000000000003', NULL, 'SYS-ESCROW-USD',     'system_escrow',     'USD', 0.0000, 0.0000, 'active'),
    ('00000000-0000-0000-0000-000000000004', NULL, 'SYS-SUSPENSE-USD',   'system_suspense',   'USD', 0.0000, 0.0000, 'active')
ON CONFLICT (account_number) DO NOTHING;

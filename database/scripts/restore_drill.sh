#!/usr/bin/env bash
set -euo pipefail

# Restore Drill Script (Assessment 14)
# Usage: ./restore_drill.sh <encrypted_backup_file> <target_database_url>
BACKUP_FILE="${1:?Provide path to .sql.gz.enc}"
TARGET_DB_URL="${2:?Provide target test/staging DATABASE_URL}"

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo "ERROR: BACKUP_ENCRYPTION_KEY must be set"
  exit 1
fi

openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -in "${BACKUP_FILE}" | gunzip | psql "${TARGET_DB_URL}"
echo "Restore drill completed. Verifying ledger balance invariant..."
psql "${TARGET_DB_URL}" -c "SELECT COUNT(*) AS unbalanced_txs FROM (SELECT transaction_id FROM ledger_entries GROUP BY transaction_id HAVING SUM(CASE WHEN entry_type='DEBIT' THEN amount ELSE -amount END) <> 0) t;"

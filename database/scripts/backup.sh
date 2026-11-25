#!/usr/bin/env bash
set -euo pipefail

# Encrypted PostgreSQL Backup Script (Assessment 14)
BACKUP_DIR="${BACKUP_DIR:-./database/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUT_FILE="${BACKUP_DIR}/fincore_${TIMESTAMP}.sql.gz.enc"

mkdir -p "${BACKUP_DIR}"

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo "ERROR: BACKUP_ENCRYPTION_KEY must be set"
  exit 1
fi

pg_dump "${DATABASE_URL}" | gzip | openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY -out "${OUT_FILE}"
echo "Encrypted backup created: ${OUT_FILE}"

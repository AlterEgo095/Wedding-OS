#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# backup-restore-test.sh — Sprint P0-3 (audit Wedding OS 2026-09-01)
# ══════════════════════════════════════════════════════════════════════════════
# Test de restauration hebdomadaire : prend le DERNIER backup .gz, vérifie
# l'intégrité gzip + SQLite, compte tables / mariages / invités, journalise,
# puis nettoie. AUCUNE écriture sur la DB de production (lecture seule).
# Installé par /etc/cron.d/wedding-backup-watchdog (dimanche 03:30).
# Test manuel : sudo /opt/wedding-platform/scripts/backup-restore-test.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/wedding-platform/backups}"
LOG_FILE="${LOG_FILE:-/var/log/wedding-backup.log}"
WORK_DIR=$(mktemp -d /tmp/wedding-restore-test.XXXXXX)
trap 'rm -rf "$WORK_DIR"' EXIT

latest=$(ls -1t "$BACKUP_DIR"/wedding-db-*.db.gz 2>/dev/null | head -1 || true)
if [ -z "$latest" ]; then
  echo "[$(date '+%F %T')] RESTORE-TEST FAILURE: aucun backup trouvé dans $BACKUP_DIR" >> "$LOG_FILE"
  exit 4
fi

# 1. Intégrité de l'archive
gunzip -t "$latest"

# 2. Restauration réelle dans un espace temporaire
cp "$latest" "$WORK_DIR/restore.db.gz"
gunzip "$WORK_DIR/restore.db.gz"

# 3. Intégrité SQLite de la copie restaurée
integrity=$(sqlite3 "$WORK_DIR/restore.db" "PRAGMA integrity_check;")
if [ "$integrity" != "ok" ]; then
  echo "[$(date '+%F %T')] RESTORE-TEST FAILURE: integrity_check=$integrity file=$(basename "$latest")" >> "$LOG_FILE"
  exit 5
fi

# 4. Comptages de contrôle (lecture seule)
tables=$(sqlite3 "$WORK_DIR/restore.db" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%';")
weddings=$(sqlite3 "$WORK_DIR/restore.db" "SELECT COUNT(*) FROM \"Wedding\";")
guests=$(sqlite3 "$WORK_DIR/restore.db" "SELECT COUNT(*) FROM \"Guest\";")

if [ "$tables" -lt 50 ] || [ "$weddings" -lt 1 ]; then
  echo "[$(date '+%F %T')] RESTORE-TEST FAILURE: comptages incohérents tables=$tables weddings=$weddings" >> "$LOG_FILE"
  exit 6
fi

echo "[$(date '+%F %T')] RESTORE-TEST SUCCESS file=$(basename "$latest") integrity=ok tables=$tables weddings=$weddings guests=$guests" >> "$LOG_FILE"
echo "RESTORE-TEST OK : tables=$tables weddings=$weddings guests=$guests"

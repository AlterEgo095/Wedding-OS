#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# backup-watchdog.sh — Sprint P0-3 (audit Wedding OS 2026-09-01)
# ══════════════════════════════════════════════════════════════════════════════
# Vérifie que le backup quotidien wedding-db est récent et valide.
#   - ALERTE si aucun backup trouvé
#   - ALERTE si le dernier .gz a plus de MAX_AGE_H heures (cron = 02:00 → 26h)
#   - ALERTE si le dernier "END rc=" du journal n'est pas rc=0
# Alerte = fichier $BACKUP_DIR/BACKUP-ALERT + entrée syslog (logger).
# Silence = alerte précédente effacée.
# Installé par /etc/cron.d/wedding-backup-watchdog (06:00 quotidien).
# Test manuel : sudo /opt/wedding-platform/scripts/backup-watchdog.sh
# Rollback    : sudo rm /etc/cron.d/wedding-backup-watchdog
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/wedding-platform/backups}"
LOG_FILE="${LOG_FILE:-/var/log/wedding-backup.log}"
MAX_AGE_H="${MAX_AGE_H:-26}"
ALERT_FILE="$BACKUP_DIR/BACKUP-ALERT"
MSG=""

latest=$(ls -1t "$BACKUP_DIR"/wedding-db-*.db.gz 2>/dev/null | head -1 || true)
if [ -z "$latest" ]; then
  MSG="Aucun backup wedding-db trouvé dans $BACKUP_DIR"
else
  age_h=$(( ( $(date +%s) - $(stat -c %Y "$latest") ) / 3600 ))
  if [ "$age_h" -gt "$MAX_AGE_H" ]; then
    MSG="Dernier backup trop ancien : $(basename "$latest") (${age_h}h > ${MAX_AGE_H}h)"
  fi
fi

if [ -z "$MSG" ] && [ -f "$LOG_FILE" ]; then
  last_end=$(grep " END rc=" "$LOG_FILE" 2>/dev/null | tail -1 || true)
  if [ -n "$last_end" ] && ! echo "$last_end" | grep -q "rc=0"; then
    MSG="Dernier backup en échec : $last_end"
  fi
fi

if [ -n "$MSG" ]; then
  printf '[%s] BACKUP-ALERT: %s\n' "$(date '+%F %T')" "$MSG" >> "$ALERT_FILE"
  logger -t wedding-backup "ALERT: $MSG" 2>/dev/null || true
  exit 1
fi

rm -f "$ALERT_FILE"
exit 0

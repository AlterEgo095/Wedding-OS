# ━━━ V4 — Restore test (LEVEL 1, lecture/copy) ━━━
# Test de restauration d'un backup de la base SQLite Wedding OS.
#
# CONCEPT :
#   1. Prendre le backup le plus récent (scripts/backup-db.sh sort).
#   2. Le restaurer dans une base de TEST (jamais sur la prod).
#   3. Vérifier l'intégrité (PRAGMA integrity_check) + les comptes clés.
#
# USAGE :
#   bash scripts/restore-test.sh
#
# STOP CONDITIONS :
#   - Aucun backup trouvé => WARN, ne restaure rien.
#   - Backup corrompu => erreur, on ne touche pas à la base de test.
#   - Si BACKUP_TEST_DB_PATH pointe vers /app/db/custom.db => REFUS.
#
# SAFETY :
#   Ce script ne SUPPRIME JAMAIS /app/db/custom.db de production.
#   Il restaure dans /tmp/wedding-restore-test-*.db et détruit ce fichier à la fin.

#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/wedding-platform/backups}"
BACKUP_TEST_DB_PATH="${BACKUP_TEST_DB_PATH:-/tmp/wedding-restore-test-$$.db}"

# ─── Refus de pointer vers la prod ──────────────────────────────────────────
if [[ "$BACKUP_TEST_DB_PATH" == "/app/db/custom.db" || \
      "$BACKUP_TEST_DB_PATH" == */wedding-platform/db/custom.db ]]; then
  echo "REFUS: BACKUP_TEST_DB_PATH pointe vers la production. Arrêt." >&2
  exit 2
fi

# ─── Trouver le backup le plus récent ────────────────────────────────────────
LATEST=$(ls -t "$BACKUP_DIR"/wedding-db-*.db.gz 2>/dev/null | head -1 || true)
if [[ -z "$LATEST" ]]; then
  echo "WARN: aucun backup trouvé dans $BACKUP_DIR. Pensez à activer scripts/backup-db.cron.example." >&2
  exit 0
fi
echo "Dernier backup: $LATEST ($(stat -c %s "$LATEST") octets)"

# ─── Décompression ──────────────────────────────────────────────────────────
rm -f "$BACKUP_TEST_DB_PATH"
gunzip -c "$LATEST" > "$BACKUP_TEST_DB_PATH"
echo "Restauré dans: $BACKUP_TEST_DB_PATH"

# ─── Intégrité ───────────────────────────────────────────────────────────────
INTEGRITY=$(sqlite3 "$BACKUP_TEST_DB_PATH" "PRAGMA integrity_check;" 2>&1)
if [[ "$INTEGRITY" != "ok" ]]; then
  echo "ERREUR: backup corrompu — integrity_check=$INTEGRITY" >&2
  rm -f "$BACKUP_TEST_DB_PATH"
  exit 3
fi
echo "Intégrité: ok"

# ─── Comptes clés ───────────────────────────────────────────────────────────
echo "--- Comptes clés dans le backup ---"
for t in Wedding Guest Invitation Media AdminUser Organization Deployment ExperienceEvent; do
  COUNT=$(sqlite3 "$BACKUP_TEST_DB_PATH" "SELECT COUNT(*) FROM \"${t}\";" 2>/dev/null || echo "table absente")
  printf "  %-20s %s\n" "$t" "$COUNT"
done

# ─── Cleanup ────────────────────────────────────────────────────────────────
rm -f "$BACKUP_TEST_DB_PATH"
echo "Restauration testée OK — fichier temporaire supprimé."

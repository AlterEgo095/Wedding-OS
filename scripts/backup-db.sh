#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# backup-db.sh — V4.2 / B1 : sauvegarde fiable de la base SQLite PRODUCTION
# ══════════════════════════════════════════════════════════════════════════════
# CORRECTIFS V4.2 (vs version du 2026-07-04, sauvegardée en .pre-v42) :
#   1. SOURCE = DB VIVANTE (volume Docker) — l'ancienne version pointait sur la
#      copie périmée du repo /opt/wedding-platform/db/custom.db (7 mariages
#      fantômes, dernier état 07/08) et produisait des « backups valides »
#      de données mortes.
#   2. Suppression du fallback `cp` (incohérent en mode WAL) : REFUS sans sqlite3.
#   3. Pipeline atomique : fichiers temporaires cachés -> intégrité ->
#      checksum -> compression -> gzip -t -> renommage atomique (mv).
#   4. Checksum SHA-256 du backup final + sidecar validé par sha256sum -c.
#   5. Métadonnées (.meta) : timestamp, tailles, source, checksums, intégrité,
#      version SQLite, nb tables, user_version.
#   6. flock anti-concurrence + purge des temporaires orphelins (> 60 min).
#   7. Contrôle espace disque AVANT écriture (3 x source + MIN_FREE_MB).
#   8. Rétention UNIQUEMENT APRÈS validation du nouveau backup (14 derniers).
#   9. Journal structuré START/SUCCESS/FAILURE/SIZE/CHECKSUM/RETENTION/END,
#      codes de sortie documentés, permissions minimales (640 root:aenews).
#
# EXÉCUTION : root requis (lecture du volume Docker réservée à root).
#   Installé par /etc/cron.d/wedding-backup (02:00 Africa/Kinshasa, V4.2).
#   Test manuel : sudo /opt/wedding-platform/scripts/backup-db.sh
#
# SURCHARGES POUR TESTS CONTRÔLÉS (aucune écriture production) :
#   DB_SOURCE, BACKUP_DIR, LOG_FILE, RETENTION_KEEP, MIN_FREE_MB, BACKUP_GROUP
#
# CODES DE SORTIE :
#   0 = OK (ou SKIP concurrence) · 1 = source absente/refusée · 2 = sqlite3 absent
#   3 = destination inaccessible / espace insuffisant · 4 = échec backup
#   5 = intégrité SQLite · 6 = checksum / atomique
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
DB_SOURCE="${DB_SOURCE:-/var/lib/docker/volumes/wedding-platform_wedding-db/_data/custom.db}"
STALE_REPO_DB="/opt/wedding-platform/db/custom.db"    # copie périmée -> REFUS
BACKUP_DIR="${BACKUP_DIR:-/opt/wedding-platform/backups}"
LOG_FILE="${LOG_FILE:-/var/log/wedding-backup.log}"
RETENTION_KEEP="${RETENTION_KEEP:-14}"
MIN_FREE_MB="${MIN_FREE_MB:-500}"
BACKUP_GROUP="${BACKUP_GROUP:-aenews}"

TS="$(date +%Y%m%d_%H%M%S)"
TMP_DB="$BACKUP_DIR/.inprogress-$TS.db"
TMP_GZ="$BACKUP_DIR/.inprogress-$TS.db.gz"
TMP_SHA="$BACKUP_DIR/.inprogress-$TS.db.gz.sha256"
TMP_META="$BACKUP_DIR/.inprogress-$TS.db.meta"
FINAL_GZ="$BACKUP_DIR/wedding-db-$TS.db.gz"
FINAL_SHA="$BACKUP_DIR/wedding-db-$TS.db.gz.sha256"
FINAL_META="$BACKUP_DIR/wedding-db-$TS.db.meta"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE" 2>/dev/null || true; }
cleanup_tmp() { rm -f -- "$TMP_DB" "$TMP_GZ" "$TMP_SHA" "$TMP_META" 2>/dev/null || true; }
fail() {
  log "FAILURE: $1 (exit $2)"
  echo "FAILURE: $1 (exit $2)" >&2
  cleanup_tmp
  log "END rc=$2"
  exit "$2"
}

# ─── 0. Destination + verrou anti-concurrence ─────────────────────────────────
if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
  log "FAILURE: BACKUP_DIR inaccessible : $BACKUP_DIR (exit 3)"
  echo "FAILURE: BACKUP_DIR inaccessible : $BACKUP_DIR" >&2
  exit 3
fi
exec 9>"$BACKUP_DIR/.backup.lock"
if ! flock -n 9; then
  log "SKIP: une autre exécution de backup-db.sh est en cours (flock) — aucun traitement"
  echo "SKIP: exécution concurrente détectée" >&2
  exit 0
fi
touch "$LOG_FILE" 2>/dev/null || true
chmod 600 "$LOG_FILE" 2>/dev/null || true
log "START host=$(hostname) pid=$$ source=$DB_SOURCE"

# ─── 1. Pré-vols ──────────────────────────────────────────────────────────────
[[ "$DB_SOURCE" == "$STALE_REPO_DB" ]] && fail "DB_SOURCE est la copie périmée du repo ($STALE_REPO_DB) — REFUS (piège documenté V4.1)" 1
[[ -f "$DB_SOURCE" ]] || fail "source DB introuvable : $DB_SOURCE" 1
if [[ ! -r "$DB_SOURCE" && $EUID -ne 0 ]]; then
  fail "$DB_SOURCE illisible par $(id -un) — exécution root requise (volume Docker)"
fi
command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 absent — REFUS (le fallback cp est interdit : incohérent en WAL)" 2

SRC_SIZE=$(stat -c %s "$DB_SOURCE")
FREE_KB=$(df -k "$BACKUP_DIR" 2>/dev/null | awk 'NR==2{print $4}')
[[ "$FREE_KB" =~ ^[0-9]+$ ]] || fail "impossible de mesurer l'espace disque de $BACKUP_DIR" 3
NEED_KB=$(( SRC_SIZE / 1024 * 3 + MIN_FREE_MB * 1024 ))
(( FREE_KB > NEED_KB )) || fail "espace disque insuffisant : libre=${FREE_KB} KB, requis=${NEED_KB} KB (source=${SRC_SIZE} B x3 + marge ${MIN_FREE_MB} MB)" 3

# purge des temporaires orphelins (> 60 min) d'une exécution interrompue
find "$BACKUP_DIR" -maxdepth 1 -name '.inprogress-*' -mmin +60 -exec rm -f -- {} + 2>/dev/null || true

# ─── 2. Snapshot transaction-safe (API online backup de SQLite) ───────────────
# .backup lit la base vivante (WAL inclus) sans y écrire ; le résultat est un
# fichier autonome et cohérent. AUCUN checkpoint, AUCUNE écriture sur la source.
if ! sqlite3 "$DB_SOURCE" ".backup '$TMP_DB'"; then fail "sqlite3 .backup a échoué (source : $DB_SOURCE)" 4; fi
[[ -s "$TMP_DB" ]] || fail "snapshot vide ou absent : $TMP_DB" 4

# ─── 3. Intégrité du snapshot ─────────────────────────────────────────────────
if ! INTEGRITY=$(sqlite3 "$TMP_DB" "PRAGMA integrity_check;" 2>&1); then fail "integrity_check a échoué : $INTEGRITY" 5; fi
[[ "$INTEGRITY" == "ok" ]] || fail "integrity_check != ok : $INTEGRITY" 5
if ! FK=$(sqlite3 "$TMP_DB" "PRAGMA foreign_key_check;" 2>&1); then FK="(foreign_key_check indisponible)"; fi
[[ -z "$FK" ]] || log "WARN foreign_key_check : $FK"

# ─── 4. Checksum du snapshot brut, puis compression ───────────────────────────
SHA_DB=$(sha256sum "$TMP_DB" | awk '{print $1}')
gzip -9 -c "$TMP_DB" > "$TMP_GZ" || fail "gzip a échoué" 4
[[ -s "$TMP_GZ" ]] || fail "archive gzip vide ou absente : $TMP_GZ" 4
gzip -t "$TMP_GZ" 2>/dev/null || fail "archive gzip invalide (gzip -t)" 6
SHA_GZ=$(sha256sum "$TMP_GZ" | awk '{print $1}')
printf '%s  wedding-db-%s.db.gz\n' "$SHA_GZ" "$TS" > "$TMP_SHA"

# ─── 5. Métadonnées ───────────────────────────────────────────────────────────
GZ_SIZE=$(stat -c %s "$TMP_GZ")
TABLES=$(sqlite3 "$TMP_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "?")
UVER=$(sqlite3 "$TMP_DB" "PRAGMA user_version;" 2>/dev/null || echo "?")
SQLITE_VER=$(sqlite3 --version | awk '{print $1}')
{
  echo "STATUS=SUCCESS"
  echo "TIMESTAMP=$TS"
  echo "SOURCE=$DB_SOURCE"
  echo "DB_SIZE_BYTES=$SRC_SIZE"
  echo "BACKUP_SIZE_BYTES=$GZ_SIZE"
  echo "SHA256_DB=$SHA_DB"
  echo "SHA256_GZ=$SHA_GZ"
  echo "SQLITE_INTEGRITY=$INTEGRITY"
  echo "SQLITE_VERSION=$SQLITE_VER"
  echo "SCHEMA_TABLES=$TABLES"
  echo "SCHEMA_USER_VERSION=$UVER"
  echo "CREATED_BY=backup-db.sh V4.2 (B1)"
  echo "HOST=$(hostname)"
} > "$TMP_META"

# ─── 6. Permissions minimales + renommage atomique ────────────────────────────
chgrp "$BACKUP_GROUP" "$TMP_GZ" "$TMP_SHA" "$TMP_META" 2>/dev/null || true
chmod 640 "$TMP_GZ" "$TMP_SHA" "$TMP_META" 2>/dev/null || true
mv -f "$TMP_GZ" "$FINAL_GZ"
mv -f "$TMP_SHA" "$FINAL_SHA"
mv -f "$TMP_META" "$FINAL_META"
rm -f -- "$TMP_DB"

# ─── 7. Validation du checksum du fichier FINAL ───────────────────────────────
if ! (cd "$BACKUP_DIR" && sha256sum -c "wedding-db-$TS.db.gz.sha256" >/dev/null 2>&1); then
  fail "checksum final invalide pour wedding-db-$TS.db.gz"
fi

# ─── 8. Rétention — UNIQUEMENT après un backup validé ─────────────────────────
DELETED=0
while IFS= read -r old; do
  [[ -z "$old" ]] && continue
  rm -f -- "$old" "$old.sha256" "${old%.db.gz}.db.meta"
  log "RETENTION: supprimé $(basename "$old") (+ sidecars)"
  DELETED=$((DELETED + 1))
done < <(ls -t "$BACKUP_DIR"/wedding-db-*.db.gz 2>/dev/null | tail -n +"$((RETENTION_KEEP + 1))")

# ─── 9. Fin ───────────────────────────────────────────────────────────────────
log "SUCCESS file=wedding-db-$TS.db.gz size=${GZ_SIZE}B sha256=$SHA_GZ source=$DB_SOURCE"
log "SIZE db=${SRC_SIZE}B gz=${GZ_SIZE}B tables=$TABLES retention_keep=${RETENTION_KEEP} deleted=${DELETED}"
log "CHECKSUM wedding-db-$TS.db.gz $SHA_GZ"
log "END rc=0"
exit 0

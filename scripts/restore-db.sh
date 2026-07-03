#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# restore-db.sh — Restore a Wedding OS SQLite backup (P6-3)
# ══════════════════════════════════════════════════════════════════════════════
#
# Restores a previous backup produced by backup-db.sh (or a pre-restore-*.db
# snapshot produced by this very script). ALWAYS creates a safety snapshot of
# the current DB before overwriting, so the restore is reversible.
#
# Usage:
#   ./scripts/restore-db.sh wedding-os-20260703-150000.db
#   ./scripts/restore-db.sh pre-restore-20260710-020000.db
#
# Arguments:
#   $1 — backup filename (basename only, resolved inside $BACKUP_DIR)
#
# Environment variables:
#   DB_PATH    — path to the live SQLite DB (default: db/custom.db)
#   BACKUP_DIR — directory containing backups (default: backups/)
#
# Safety flow:
#   1. Validate argument + backup existence + SHA256 (if .sha256 present)
#   2. Snapshot current DB → backups/pre-restore-YYYYMMDD-HHMMSS.db
#   3. Pause for the user to stop the Docker container (the live DB cannot
#      be safely overwritten while the app is writing to it)
#   4. Copy the chosen backup over the live DB
#   5. Print the pre-restore snapshot path so the user can undo if needed
#
# Exit codes:
#   0  success
#   1  missing argument
#   2  backup file not found
#   3  checksum mismatch
#   4  pre-restore safety snapshot failed
#   5  restore cp failed
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Resolve repo root (script lives in $REPO/scripts/) ───────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Config (env-overridable) ─────────────────────────────────────────────────
DB_PATH="${DB_PATH:-$REPO_DIR/db/custom.db}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"

# ─── 1. Argument check ────────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-filename>" >&2
  echo "  e.g. $0 wedding-os-20260703-150000.db" >&2
  echo "  e.g. $0 pre-restore-20260710-020000.db" >&2
  exit 1
fi

BACKUP_NAME="$1"
BACKUP_FILE="$BACKUP_DIR/$BACKUP_NAME"

# ─── 2. Backup must exist ─────────────────────────────────────────────────────
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: backup file not found: $BACKUP_FILE" >&2
  echo "       available backups in $BACKUP_DIR:" >&2
  if [[ -d "$BACKUP_DIR" ]]; then
    ls -1 "$BACKUP_DIR"/*.db 2>/dev/null | sed 's/^/         /' >&2 || true
  fi
  exit 2
fi

# ─── 3. Verify SHA256 if companion file exists ────────────────────────────────
SHA_FILE="$BACKUP_FILE.sha256"
if [[ -f "$SHA_FILE" ]]; then
  if command -v sha256sum >/dev/null 2>&1; then
    if ! ( cd "$BACKUP_DIR" && sha256sum -c "$(basename "$SHA_FILE")" >/dev/null 2>&1 ); then
      echo "ERROR: SHA256 checksum mismatch for $BACKUP_FILE" >&2
      echo "       the backup file may be corrupted or truncated" >&2
      exit 3
    fi
  elif command -v shasum >/dev/null 2>&1; then
    if ! ( cd "$BACKUP_DIR" && shasum -a 256 -c "$(basename "$SHA_FILE")" >/dev/null 2>&1 ); then
      echo "ERROR: SHA256 checksum mismatch for $BACKUP_FILE" >&2
      echo "       the backup file may be corrupted or truncated" >&2
      exit 3
    fi
  else
    echo "WARN: neither sha256sum nor shasum available — skipping checksum verification" >&2
  fi
else
  echo "WARN: no .sha256 companion for $BACKUP_NAME — skipping checksum verification" >&2
fi

# ─── 4. Pre-restore safety snapshot of the CURRENT DB ─────────────────────────
# So the restore is reversible: if the chosen backup turns out to be the wrong
# one, the user can re-restore from this pre-restore-*.db snapshot.
PRE_RESTORE_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
PRE_RESTORE_FILE="$BACKUP_DIR/pre-restore-$PRE_RESTORE_TIMESTAMP.db"
PRE_RESTORE_SHA="$PRE_RESTORE_FILE.sha256"

if [[ -f "$DB_PATH" ]]; then
  mkdir -p "$BACKUP_DIR"
  # Use sqlite3 .backup for online consistency if available, else cp.
  if command -v sqlite3 >/dev/null 2>&1; then
    if ! sqlite3 "$DB_PATH" ".backup '$PRE_RESTORE_FILE'"; then
      echo "ERROR: pre-restore safety snapshot (sqlite3 .backup) failed" >&2
      rm -f "$PRE_RESTORE_FILE"
      exit 4
    fi
  else
    if ! cp "$DB_PATH" "$PRE_RESTORE_FILE"; then
      echo "ERROR: pre-restore safety snapshot (cp) failed" >&2
      rm -f "$PRE_RESTORE_FILE"
      exit 4
    fi
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    ( cd "$BACKUP_DIR" && sha256sum "$(basename "$PRE_RESTORE_FILE")" > "$PRE_RESTORE_SHA" )
  elif command -v shasum >/dev/null 2>&1; then
    ( cd "$BACKUP_DIR" && shasum -a 256 "$(basename "$PRE_RESTORE_FILE")" > "$PRE_RESTORE_SHA" )
  fi
  echo "✓ Pre-restore safety snapshot created: $PRE_RESTORE_FILE"
else
  echo "WARN: no current DB at $DB_PATH — skipping pre-restore snapshot (first-time restore)" >&2
  PRE_RESTORE_FILE="(none — no prior DB existed)"
fi

# ─── 5. Pause for the user to stop the Docker container ───────────────────────
# Overwriting the live DB while the app is writing to it can corrupt the file.
# We can't stop the container from here (no docker access assumed) — we ask the
# user to do it manually.
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Arrêtez le conteneur docker avant de continuer."
echo "  Appuyez sur Entrée pour continuer, Ctrl+C pour annuler."
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "  e.g.  docker compose -f docker-compose.prod.yml stop app"
echo ""
read -r -p "  Press Enter when the container is stopped... "

# ─── 6. Restore: copy the backup over the live DB ─────────────────────────────
# `cp` (not `mv`) so the source backup stays in place for future restores.
# Remove any stale -journal/-wal/-shm sidecars so SQLite doesn't replay old
# WAL frames on top of the restored snapshot.
if [[ -f "$DB_PATH-wal" ]]; then
  rm -f "$DB_PATH-wal"
fi
if [[ -f "$DB_PATH-shm" ]]; then
  rm -f "$DB_PATH-shm"
fi
if [[ -f "$DB_PATH-journal" ]]; then
  rm -f "$DB_PATH-journal"
fi

if ! cp "$BACKUP_FILE" "$DB_PATH"; then
  echo "ERROR: restore cp failed ($BACKUP_FILE → $DB_PATH)" >&2
  echo "       the pre-restore snapshot at $PRE_RESTORE_FILE can be used to recover" >&2
  exit 5
fi

# Match the source backup's mtime on the restored DB so retention is consistent
touch -r "$BACKUP_FILE" "$DB_PATH" 2>/dev/null || true

# ─── 7. Success ───────────────────────────────────────────────────────────────
echo ""
echo "─── Restore complete ──────────────────────────────────────────────"
echo "  Restored from : $BACKUP_FILE"
echo "  Live DB now   : $DB_PATH"
if [[ -f "$PRE_RESTORE_FILE" ]]; then
  echo "  Pre-restore   : $PRE_RESTORE_FILE"
  echo "                  ↑ keep this path — it's your undo button."
  echo "                    To undo: ./scripts/restore-db.sh $(basename "$PRE_RESTORE_FILE")"
else
  echo "  Pre-restore   : (none — no prior DB existed at restore time)"
fi
echo "───────────────────────────────────────────────────────────────────"
echo ""
echo "  Restart the app now:"
echo "    docker compose -f docker-compose.prod.yml up -d app"
echo ""

exit 0

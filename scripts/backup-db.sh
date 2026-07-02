#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# backup-db.sh — Daily SQLite backup for Wedding OS (P0-6)
# ══════════════════════════════════════════════════════════════════════════════
#
# Creates a timestamped, compressed snapshot of the SQLite database and retains
# only the 7 most recent backups (rolling 7-day window).
#
# Usage:
#   Add to the platform user's crontab (runs at 02:00 daily):
#     0 2 * * * /opt/wedding-platform/scripts/backup-db.sh
#
# Env:
#   DATABASE_URL — Prisma connection string (e.g. "file:./db/custom.db" or
#                  "file:/opt/wedding-platform/db/custom.db"). The "file:"
#                  prefix is stripped. Falls back to the default prod path if
#                  unset (so the script works even when sourced from a shell
#                  that doesn't load .env).
#
# Output:
#   - Backup files: /opt/wedding-platform/backups/wedding-db-YYYYMMDD_HHMMSS.db.gz
#   - Log lines:    /var/log/wedding-backup.log  (one line per run)
#
# Notes:
#   - Uses `sqlite3 .backup` (online backup API) when sqlite3 is available —
#     this takes a consistent snapshot even while the app is writing. Falls
#     back to a plain `cp` if sqlite3 is not installed (less safe under load).
#   - gzip compression roughly 3-5x on typical SQLite wedding DBs.
#   - Retention: keeps the 7 newest *.db.gz files; older ones are deleted.
#   - The log file is appended to (not rotated) — pair with logrotate for
#     long-running deployments.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Resolve DB path ─────────────────────────────────────────────────────────
# Strip the "file:" prefix from DATABASE_URL (Prisma format). Fall back to the
# canonical production path so the script works without an env when invoked by
# crontab (which doesn't load .env automatically).
DB_PATH="${DATABASE_URL#file:}"
if [[ -z "${DB_PATH:-}" || "${DB_PATH}" == "${DATABASE_URL:-}" && -z "${DATABASE_URL:-}" ]]; then
  DB_PATH="/opt/wedding-platform/db/custom.db"
fi
# Handle the case where DATABASE_URL was completely unset (the `${VAR#prefix}`
# expansion leaves the literal prefix unstripped when the var is empty in some
# shells — defensive guard).
if [[ "${DB_PATH}" == "file:"* ]]; then
  DB_PATH="${DB_PATH#file:}"
fi

BACKUP_DIR="/opt/wedding-platform/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/wedding-db-$TIMESTAMP.db"
LOG_FILE="/var/log/wedding-backup.log"

mkdir -p "$BACKUP_DIR"

# ─── Pre-flight: source DB must exist ────────────────────────────────────────
if [[ ! -f "$DB_PATH" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: source DB not found at $DB_PATH — aborting." >> "$LOG_FILE"
  exit 1
fi

# ─── Snapshot ────────────────────────────────────────────────────────────────
# Prefer `sqlite3 .backup` (online, consistent) — handles concurrent writes.
# Fall back to `cp` if the sqlite3 binary isn't installed.
if command -v sqlite3 &>/dev/null; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
else
  cp "$DB_PATH" "$BACKUP_FILE"
fi

# ─── Compress ────────────────────────────────────────────────────────────────
gzip -f "$BACKUP_FILE"

# ─── Retention: keep last 7 backups ──────────────────────────────────────────
# `ls -t` sorts newest first; `tail -n +8` skips the first 7 and emits the
# rest for deletion. `-r` prevents `xargs rm` from running with no input.
ls -t "$BACKUP_DIR"/wedding-db-*.db.gz 2>/dev/null | tail -n +8 | xargs -r rm --

# ─── Log ─────────────────────────────────────────────────────────────────────
SIZE=$(stat -c %s "$BACKUP_FILE.gz" 2>/dev/null || stat -f %z "$BACKUP_FILE.gz" 2>/dev/null || echo "?")
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup created: $BACKUP_FILE.gz (${SIZE} bytes) from $DB_PATH" >> "$LOG_FILE"

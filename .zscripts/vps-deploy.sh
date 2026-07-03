#!/bin/bash
# VPS deploy script — safe deploy that preserves production .env
# Usage: bash vps-deploy.sh [commit-ref]
set -e
DEPLOY_DIR="/opt/wedding-platform"
REPO_URL="https://github.com/AlterEgo095/Wedding-OS.git"
TOKEN_URL="https://x-access-token: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@github.com/AlterEgo095/Wedding-OS.git"
REF="${1:-main}"

cd "$DEPLOY_DIR"

LOG="/tmp/wedding-build.log"
echo "[$(date)] === DEPLOY START ===" > "$LOG"
echo "Target ref: $REF" >> "$LOG"

# ── Step 1: Backup .env (production secrets) ──────────────────────────────
ENV_BACKUP="/opt/wedding-platform.env.deploy-backup"
if [ -f .env ]; then
  cp .env "$ENV_BACKUP"
  echo "Backed up .env ($(grep -cE '^[A-Z_]+=' .env) keys)" >> "$LOG"
else
  echo "WARNING: .env not found before pull!" >> "$LOG"
fi

# ── Step 2: Fetch + reset to latest ───────────────────────────────────────
git fetch "$TOKEN_URL" "$REF:refs/remotes/origin/$REF" >> "$LOG" 2>&1
git reset --hard "origin/$REF" >> "$LOG" 2>&1
echo "Now at: $(git log --oneline -1)" >> "$LOG"

# ── Step 3: Restore .env (git reset may have deleted it) ───────────────────
if [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" .env
  echo "Restored .env ($(grep -cE '^[A-Z_]+=' .env) keys)" >> "$LOG"
else
  echo "ERROR: No .env backup to restore!" >> "$LOG"
  exit 1
fi

# ── Step 4: Docker build + restart ────────────────────────────────────────
echo "" >> "$LOG"
echo "[$(date)] === docker compose up -d --build ===" >> "$LOG"
docker compose -f docker-compose.prod.yml up -d --build >> "$LOG" 2>&1 || {
  echo "BUILD FAILED — see $LOG" >> "$LOG"
  exit 1
}

# ── Step 5: Verify ─────────────────────────────────────────────────────────
echo "" >> "$LOG"
echo "[$(date)] === DEPLOY END ===" >> "$LOG"
docker ps --filter name=wedding-app --format '{{.Names}} {{.Status}}' >> "$LOG" 2>&1
echo "Deploy complete. Log: $LOG"

#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# phase4-deploy.sh — Push Phase 4 ( + Phases 1-3) to GitHub + deploy to VPS
# ══════════════════════════════════════════════════════════════════════════════
#
# CONTEXT:
#   The sandbox environment where Phase 4 was developed has NO GitHub push
#   credentials and NO VPS SSH access. All 79 unpushed commits (Phases 1-4)
#   are bundled into phase4-unpushed.bundle (17MB).
#
#   This script must be run from an environment that HAS:
#     - GitHub push access to AlterEgo095/Wedding-OS (PAT or SSH key)
#     - SSH access to the VPS (heureuxmariage.aenews.net)
#
# PREREQUISITES:
#   1. phase4-unpushed.bundle is in the same directory as this script
#   2. You have a local clone of AlterEgo095/Wedding-OS
#   3. Your local clone's origin remote can push (test: git push --dry-run)
#   4. You have SSH access to the VPS (test: ssh deploy@heureuxmariage.aenews.net echo ok)
#
# USAGE:
#   bash phase4-deploy.sh /path/to/local/Wedding-OS-clone
#
# WHAT THIS SCRIPT DOES:
#   Step 1: Fetch the 79 bundled commits into your local clone
#   Step 2: Push them to GitHub origin/main
#   Step 3: SSH into the VPS and run the deploy (git pull + docker compose up --build)
#   Step 4: Verify the VPS health endpoint
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

BUNDLE_FILE="$(cd "$(dirname "$0")" && pwd)/phase4-unpushed.bundle"
LOCAL_REPO="${1:-}"
VPS_HOST="heureuxmariage.aenews.net"
VPS_USER="${VPS_USER:-deploy}"
VPS_DEPLOY_PATH="${VPS_DEPLOY_PATH:-/opt/wedding-platform}"
PRODUCTION_URL="https://${VPS_HOST}"

# ─── Validate args ───────────────────────────────────────────────────────────
if [ ! -f "$BUNDLE_FILE" ]; then
    echo "❌ Bundle file not found: $BUNDLE_FILE"
    echo "   Ensure phase4-unpushed.bundle is in the same directory as this script."
    exit 1
fi

if [ -z "$LOCAL_REPO" ]; then
    echo "❌ Usage: bash phase4-deploy.sh /path/to/local/Wedding-OS-clone"
    echo ""
    echo "   Example: bash phase4-deploy.sh ~/projects/Wedding-OS"
    exit 1
fi

if [ ! -d "$LOCAL_REPO/.git" ]; then
    echo "❌ Not a git repository: $LOCAL_REPO"
    exit 1
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  Phase 4 Deploy — Heureux Mariage Platform"
echo "  Bundle:  $BUNDLE_FILE"
echo "  Local:   $LOCAL_REPO"
echo "  VPS:     ${VPS_USER}@${VPS_HOST}:${VPS_DEPLOY_PATH}"
echo "  Prod:    $PRODUCTION_URL"
echo "═══════════════════════════════════════════════════════════════"

# ─── Step 1: Fetch bundled commits into local clone ──────────────────────────
echo ""
echo "[1/4] Fetching 79 bundled commits into local clone..."
cd "$LOCAL_REPO"
git fetch "$BUNDLE_FILE" HEAD:refs/heads/phase4-from-sandbox 2>&1 | tail -5
echo "✅ Fetched into local branch 'phase4-from-sandbox'"

# Show what's coming
COMMIT_COUNT=$(git rev-list --count origin/main..phase4-from-sandbox 2>/dev/null || echo "?")
echo "   $COMMIT_COUNT commits to merge"

# ─── Step 2: Merge + push to GitHub ──────────────────────────────────────────
echo ""
echo "[2/4] Merging into main + pushing to GitHub origin/main..."
git checkout main 2>&1 | tail -2
git merge phase4-from-sandbox --ff-only 2>&1 | tail -5 || {
    echo "⚠️  Fast-forward merge failed (local main has diverged). Attempting rebase..."
    git rebase phase4-from-sandbox 2>&1 | tail -5 || {
        echo "❌ Merge/rebase failed. Resolve conflicts manually, then re-run from step 3."
        exit 1
    }
}
git push origin main 2>&1 | tail -5
echo "✅ Pushed to GitHub origin/main"
echo "   Latest commit: $(git log --oneline -1)"

# ─── Step 3: SSH into VPS + deploy ───────────────────────────────────────────
echo ""
echo "[3/4] Deploying on VPS (${VPS_USER}@${VPS_HOST})..."
echo "   This runs: cd $VPS_DEPLOY_PATH && git fetch + reset --hard origin/main && docker compose up -d --build"
echo "   (This may take 3-8 minutes for the Docker build)"

ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "${VPS_USER}@${VPS_HOST}" \
    "set -e; \
     cd '${VPS_DEPLOY_PATH}'; \
     echo '  → Backing up .env...'; \
     cp .env /opt/wedding-platform.env.deploy-backup; \
     echo '  → Fetching latest from origin...'; \
     git fetch origin main; \
     git reset --hard origin/main; \
     echo '  → Restoring .env...'; \
     cp /opt/wedding-platform.env.deploy-backup .env; \
     echo '  → Docker compose up -d --build...'; \
     docker compose -f docker-compose.prod.yml up -d --build 2>&1 | tail -15; \
     echo '  → Container status:'; \
     docker ps --filter name=wedding-app --format '{{.Names}} {{.Status}}'" 2>&1 | tail -30

echo "✅ VPS deploy command completed"

# ─── Step 4: Verify production health ────────────────────────────────────────
echo ""
echo "[4/4] Verifying production health endpoint..."
sleep 8  # Give the container time to start
HTTP_CODE=$(curl -sS -o /tmp/phase4-health.json -w '%{http_code}' --max-time 20 "$PRODUCTION_URL/api/health" || echo "000")
echo "   HTTP status: $HTTP_CODE"
cat /tmp/phase4-health.json 2>/dev/null | head -5
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo "═══════════════════════════════════════════════════════════════"
    echo "  🎉 PHASE 4 DEPLOY COMPLETE!"
    echo ""
    echo "  🌐 Production: $PRODUCTION_URL"
    echo "  📊 Health:     $PRODUCTION_URL/api/health"
    echo "  🔧 GitHub:     https://github.com/AlterEgo095/Wedding-OS"
    echo "═══════════════════════════════════════════════════════════════"
else
    echo "⚠️  Health check returned HTTP $HTTP_CODE (expected 200)."
    echo "   Check VPS container logs: ssh ${VPS_USER}@${VPS_HOST} docker logs --tail 50 wedding-app"
    exit 1
fi

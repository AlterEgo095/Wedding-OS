#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# scripts/deploy-production.sh — CANONICAL DEPLOYMENT SCRIPT (Mission 4.0 Phase 8)
# ══════════════════════════════════════════════════════════════════════════════
# Single, canonical way to deploy the Wedding OS to production.
# Replaces the 20+ legacy deploy-*.mjs scripts (now archived).
#
# Usage:
#   cd /opt/wedding-platform
#   ./scripts/deploy-production.sh
#
# What it does (in order):
#   1. Verify git working tree is clean (no uncommitted changes)
#   2. Verify VPS HEAD == origin/main (no divergence)
#   3. Export DEPLOY_SHA + BUILD_TIME for provenance (Phase 1)
#   4. docker compose build app (passes SHA as build arg)
#   5. docker compose up -d app (recreate container)
#   6. Wait for health endpoint
#   7. Verify deploySha in /api/health matches git HEAD
#   8. Smoke-test critical routes
#
# Non-destructive: never touches the DB volume, never does `down -v`.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(dirname "$0")/.."
echo "🚀 Deploying AENEWS Wedding OS to production..."
echo

# ─── 1. Working tree check ────────────────────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree is dirty. Commit or stash changes before deploying."
  git status -s
  exit 1
fi
echo "✅ Working tree clean"

# ─── 2. Sync check ────────────────────────────────────────────────────────────
git fetch origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "❌ VPS HEAD ($LOCAL) != origin/main ($REMOTE). Push or pull first."
  exit 1
fi
echo "✅ VPS HEAD = origin/main = ${LOCAL:0:12}"

# ─── 3. Export provenance env vars ────────────────────────────────────────────
export DEPLOY_SHA="$LOCAL"
export BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "✅ DEPLOY_SHA=$DEPLOY_SHA"
echo "✅ BUILD_TIME=$BUILD_TIME"

# ─── 4. Build ─────────────────────────────────────────────────────────────────
echo "🔨 Building Docker image (this takes ~3-5 minutes)..."
docker compose -f docker-compose.prod.yml build app
echo "✅ Build complete"

# ─── 5. Recreate container ────────────────────────────────────────────────────
echo "📦 Recreating container..."
docker compose -f docker-compose.prod.yml up -d app
echo "✅ Container recreated"

# ─── 6. Wait for health ───────────────────────────────────────────────────────
echo "⏳ Waiting for health..."
for i in $(seq 1 30); do
  H=$(curl -sk -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/api/health 2>/dev/null || echo "000")
  if [ "$H" = "200" ]; then
    echo "✅ Health OK (attempt $i)"
    break
  fi
  sleep 3
  if [ $i -eq 30 ]; then
    echo "❌ Health check failed after 30 attempts"
    exit 1
  fi
done

# ─── 7. Provenance verification ───────────────────────────────────────────────
echo "🔍 Verifying runtime provenance..."
DEPLOY_SHA_RUNTIME=$(curl -sk http://127.0.0.1:3080/api/health | python3 -c "import sys,json;print(json.load(sys.stdin).get('deploySha','unknown'))")
if [ "$DEPLOY_SHA_RUNTIME" = "$DEPLOY_SHA" ]; then
  echo "✅ Runtime deploySha matches git HEAD: ${DEPLOY_SHA:0:12}"
else
  echo "⚠️  Runtime deploySha ($DEPLOY_SHA_RUNTIME) != git HEAD ($DEPLOY_SHA)"
  echo "    (This can happen if the container was not recreated from the new image.)"
fi

# ─── 8. Smoke tests ───────────────────────────────────────────────────────────
echo "🧪 Smoke-testing critical routes..."
BASE="https://wedding.hpph.net"
for path in "/" "/api/health" "/platform/admin"; do
  CODE=$(curl -sk -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
    echo "  ✅ $path -> $CODE"
  else
    echo "  ⚠️  $path -> $CODE"
  fi
done

echo
echo "🎉 Deployment complete!"
echo "   Git SHA:        ${DEPLOY_SHA:0:12}"
echo "   Runtime deploySha: ${DEPLOY_SHA_RUNTIME:0:12}"
echo "   Build time:     $BUILD_TIME"

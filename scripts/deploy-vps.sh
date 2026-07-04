#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# deploy-vps.sh — Production deploy for heureuxmariage.aenews.net
# ══════════════════════════════════════════════════════════════════════════════
#
# Formalizes the manual Phase 4 deploy into a single repeatable script:
#   1. Pre-flight: GITHUB_TOKEN, lint, tsc, clean tree, VPS reachable
#   2. Push commit to GitHub origin/main using token-embedded remote URL
#   3. On the VPS: backup .env, git fetch + reset --hard origin/main, rebuild
#      docker image, wait for healthy, prisma db push (one-off container),
#      restart app, wait for healthy again
#   4. Verify https://heureuxmariage.aenews.net/api/health,
#      /api/theme?slug=josue-hornella, and / all return HTTP 200
#
# Usage:
#   GITHUB_TOKEN=ghp_xxx ./scripts/deploy-vps.sh
#   export GITHUB_TOKEN=ghp_xxx; ./scripts/deploy-vps.sh
#
# Exit codes:
#   0  success
#   1  pre-flight check failed
#   2  git push failed
#   3  VPS deploy step failed
#   4  production health check failed
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Exit codes ───────────────────────────────────────────────────────────────
EXIT_SUCCESS=0
EXIT_PREFLIGHT=1
EXIT_GIT_PUSH=2
EXIT_VPS_DEPLOY=3
EXIT_HEALTH=4

# ─── Configuration ────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_HELPER="${REPO_ROOT}/.zscripts/vps_ssh.py"
GITHUB_REPO="AlterEgo095/Wedding-OS"
GITHUB_CLEAN_URL="https://github.com/${GITHUB_REPO}.git"
PRODUCTION_URL="https://heureuxmariage.aenews.net"
VPS_DEPLOY_DIR="/opt/wedding-platform"
VPS_DB_VOLUME="wedding-platform_wedding-db"
HEALTH_TIMEOUT_SEC=180
HEALTH_POLL_INTERVAL_SEC=3

TOTAL_STEPS=12

# ─── Helpers ──────────────────────────────────────────────────────────────────
step() {
  # step <index> <total> <title>
  printf '\n\033[1;36m── [STEP %s/%s] %s ──\033[0m\n' "$1" "$2" "$3"
}

ok() {
  printf '  \033[1;32m✓\033[0m %s\n' "$1"
}

err() {
  printf '  \033[1;31m✗\033[0m %s\n' "$1" >&2
}

vps() {
  # Run a remote bash script on the VPS via the paramiko helper.
  # The helper joins all args with spaces and feeds them to the user's shell,
  # so we pass the entire remote script as a single argument to preserve
  # multi-line structure.
  python3 "${VPS_HELPER}" "$1"
}

fail_preflight() { err "$1"; exit "${EXIT_PREFLIGHT}"; }
fail_git_push()  { err "$1"; exit "${EXIT_GIT_PUSH}"; }
fail_vps()       { err "$1"; exit "${EXIT_VPS_DEPLOY}"; }
fail_health()    { err "$1"; exit "${EXIT_HEALTH}"; }

# Reusable remote wait-for-healthy block (paramiko-safe bash).
# Polls `docker inspect wedding-app` health status every
# ${HEALTH_POLL_INTERVAL_SEC}s, up to ${HEALTH_TIMEOUT_SEC}s. Exits 0 once
# healthy, 1 on timeout (after dumping the last 30 log lines).
REMOTE_WAIT_FOR_HEALTHY=$(cat <<REMOTE_EOF
set -e
DEADLINE=\$((\$(date +%s) + ${HEALTH_TIMEOUT_SEC}))
while [ \$(date +%s) -lt \$DEADLINE ]; do
  STATUS=\$(docker inspect wedding-app --format='{{.State.Health.Status}}' 2>/dev/null || echo "missing")
  if [ "\$STATUS" = "healthy" ]; then
    echo "  container healthy (\${STATUS})"
    exit 0
  fi
  sleep ${HEALTH_POLL_INTERVAL_SEC}
done
echo "  TIMEOUT: container not healthy after ${HEALTH_TIMEOUT_SEC}s"
docker ps --filter name=wedding-app --format '{{.Names}} {{.Status}}'
docker logs wedding-app --tail 30 2>&1 || true
exit 1
REMOTE_EOF
)

# ══════════════════════════════════════════════════════════════════════════════
# PRE-FLIGHT CHECKS
# ══════════════════════════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════════"
echo "  Heureux Mariage — Production Deploy"
echo "  Repo:     ${REPO_ROOT}"
echo "  GitHub:   ${GITHUB_CLEAN_URL}"
echo "  VPS dir:  ${VPS_DEPLOY_DIR}"
echo "  Prod URL: ${PRODUCTION_URL}"
echo "═══════════════════════════════════════════════════════════════"

# ─── Step 1/12: Validate GITHUB_TOKEN ─────────────────────────────────────────
step 1 "${TOTAL_STEPS}" "Validate GITHUB_TOKEN"
if [ -z "${GITHUB_TOKEN:-}" ]; then
  err "GITHUB_TOKEN environment variable is not set."
  echo ""
  echo "Usage:"
  echo "  GITHUB_TOKEN=ghp_xxx ./scripts/deploy-vps.sh"
  echo "  export GITHUB_TOKEN=ghp_xxx && ./scripts/deploy-vps.sh"
  echo ""
  echo "The token is used once to push to ${GITHUB_CLEAN_URL} and once"
  echo "on the VPS to fetch origin/main. It is never written to disk."
  exit "${EXIT_PREFLIGHT}"
fi
ok "GITHUB_TOKEN is set (length ${#GITHUB_TOKEN}, prefix ${GITHUB_TOKEN:0:4}***)"

# ─── Step 2/12: Lint ──────────────────────────────────────────────────────────
step 2 "${TOTAL_STEPS}" "Lint check (bun run lint)"
cd "${REPO_ROOT}"
if ! bun run lint; then
  fail_preflight "Lint failed. Fix lint errors before deploying."
fi
ok "Lint clean"

# ─── Step 3/12: TypeScript ────────────────────────────────────────────────────
step 3 "${TOTAL_STEPS}" "TypeScript check (npx tsc --noEmit)"
if ! npx tsc --noEmit; then
  fail_preflight "TypeScript check failed. Fix type errors before deploying."
fi
ok "TypeScript clean"

# ─── Step 4/12: Git working tree clean ────────────────────────────────────────
step 4 "${TOTAL_STEPS}" "Git working tree clean"
DIRTY="$(git status --porcelain)"
if [ -n "${DIRTY}" ]; then
  err "Git working tree is dirty:"
  echo "${DIRTY}" | sed 's/^/    /'
  echo ""
  err "Commit or stash changes before deploying."
  exit "${EXIT_PREFLIGHT}"
fi
ok "Working tree clean (HEAD: $(git log --oneline -1))"

# ─── Step 5/12: VPS reachable ─────────────────────────────────────────────────
step 5 "${TOTAL_STEPS}" "VPS reachable via ${VPS_HELPER}"
if [ ! -f "${VPS_HELPER}" ]; then
  err "VPS helper not found: ${VPS_HELPER}"
  echo ""
  echo "  Create it from the template:"
  echo "    cp .zscripts/vps_ssh.example.py .zscripts/vps_ssh.py"
  echo "    pip install paramiko"
  echo ""
  echo "  Then configure credentials in .zscripts/.vps-creds (gitignored):"
  echo "    VPS_HOST=your.vps.ip"
  echo "    VPS_PORT=22"
  echo "    VPS_USER=your_user"
  echo "    VPS_PASS=your_password"
  exit "${EXIT_PREFLIGHT}"
fi
if ! VPS_PROBE="$(vps 'echo ok-from-vps' 2>/dev/null)"; then
  err "VPS SSH helper failed. Diagnostic:"
  echo ""
  echo "  1. Is paramiko installed?  →  pip install paramiko"
  echo "  2. Are credentials set?    →  cat .zscripts/.vps-creds  (should have VPS_HOST/USER/PASS)"
  echo "  3. Is the VPS online?      →  ping \$(grep VPS_HOST .zscripts/.vps-creds | cut -d= -f2)"
  echo ""
  echo "  Running vps_ssh.py directly to surface the real error:"
  vps 'echo ok' 2>&1 | sed 's/^/    /' || true
  fail_preflight "VPS SSH helper failed."
fi
if ! echo "${VPS_PROBE}" | grep -q 'ok-from-vps'; then
  fail_preflight "VPS probe did not return expected marker. Got: ${VPS_PROBE}"
fi
ok "VPS reachable (${VPS_PROBE})"

# ══════════════════════════════════════════════════════════════════════════════
# PUSH TO GITHUB
# ══════════════════════════════════════════════════════════════════════════════

# ─── Step 6/12: Push to GitHub origin/main ────────────────────────────────────
step 6 "${TOTAL_STEPS}" "Push to GitHub origin/main"
# Token URL format: https://<token>@github.com/<owner>/<repo>.git
# GITHUB_REPO is "owner/repo" (no host), so we prepend github.com/ explicitly.
TOKEN_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"
ORIGINAL_URL="$(git remote get-url origin)"
echo "  Original remote: ${ORIGINAL_URL}"

# Set token-embedded URL and install a trap so the clean URL is ALWAYS
# restored — even on Ctrl-C or unexpected failure.
git remote set-url origin "${TOKEN_URL}"
restore_remote() {
  # Restore the clean (no-token) remote URL so the token is never left in
  # .git/config. Idempotent — safe to call multiple times.
  git remote set-url origin "${GITHUB_CLEAN_URL}" 2>/dev/null || true
}
trap restore_remote EXIT

if ! git push origin main; then
  err "git push origin main failed."
  restore_remote
  trap - EXIT
  exit "${EXIT_GIT_PUSH}"
fi

PUSHED_HASH="$(git rev-parse HEAD)"
PUSHED_SHORT="$(git rev-parse --short HEAD)"

# Restore the clean URL explicitly and remove the trap so the rest of the
# script can use other traps if needed.
restore_remote
trap - EXIT
ok "Pushed commit ${PUSHED_SHORT} (${PUSHED_HASH}) to origin/main"
ok "Remote restored to ${GITHUB_CLEAN_URL}"

# ══════════════════════════════════════════════════════════════════════════════
# DEPLOY ON VPS
# ══════════════════════════════════════════════════════════════════════════════

# ─── Step 7/12: VPS git pull + .env backup ────────────────────────────────────
step 7 "${TOTAL_STEPS}" "VPS: backup .env + git reset --hard origin/main + stamp DEPLOY_SHA"
REMOTE_PREP=$(cat <<REMOTE_EOF
set -e
cd "${VPS_DEPLOY_DIR}"
TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="/opt/wedding-platform.env.backup.\${TIMESTAMP}"
cp .env "\${BACKUP_PATH}"
echo "  .env backed up to \${BACKUP_PATH}"
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"
git fetch origin main
git reset --hard origin/main
git remote set-url origin "https://github.com/${GITHUB_REPO}.git"
echo "  HEAD on VPS: \$(git log --oneline -1)"
# Phase 5: stamp DEPLOY_SHA into .env so /api/health can report which commit
# is live. Idempotent — removes any prior DEPLOY_SHA line first.
VPS_SHA=\$(git rev-parse HEAD)
if grep -q '^DEPLOY_SHA=' .env; then
  sed -i "s|^DEPLOY_SHA=.*|DEPLOY_SHA=\${VPS_SHA}|" .env
else
  echo "DEPLOY_SHA=\${VPS_SHA}" >> .env
fi
echo "  .env stamped: DEPLOY_SHA=\${VPS_SHA:0:7}"
REMOTE_EOF
)
if ! vps "${REMOTE_PREP}"; then
  # Belt-and-suspenders: ensure the VPS remote is restored to the clean URL
  # even if the prep script failed mid-way.
  vps "cd ${VPS_DEPLOY_DIR} && git remote set-url origin https://github.com/${GITHUB_REPO}.git 2>/dev/null || true" >/dev/null 2>&1 || true
  fail_vps "VPS git pull / .env backup failed."
fi
ok "VPS code updated to ${PUSHED_SHORT}"

# ─── Step 8/12: VPS docker compose up --build ─────────────────────────────────
step 8 "${TOTAL_STEPS}" "VPS: docker compose up -d --build (rebuild image)"
REMOTE_BUILD="cd ${VPS_DEPLOY_DIR} && docker compose -f docker-compose.prod.yml up -d --build 2>&1 | tail -40"
if ! vps "${REMOTE_BUILD}"; then
  fail_vps "docker compose up -d --build failed on the VPS."
fi
ok "Container built + started"

# ─── Step 9/12: Wait for container healthy (first time) ───────────────────────
step 9 "${TOTAL_STEPS}" "VPS: wait for healthy (max ${HEALTH_TIMEOUT_SEC}s)"
if ! vps "${REMOTE_WAIT_FOR_HEALTHY}"; then
  fail_vps "Container did not become healthy after first build."
fi
ok "Container healthy after build"

# ─── Step 10/12: VPS prisma db push + restart ─────────────────────────────────
# The Phase 4 incident showed that a fresh image build does NOT run prisma
# db push automatically (the production Dockerfile has no migrate step and
# the container's prisma client was generated against the build-time schema,
# not the runtime DB schema). We run prisma db push in a one-off container
# that mounts the DB volume, then restart the app so its prisma client
# re-reads the freshly-pushed schema.
step 10 "${TOTAL_STEPS}" "VPS: prisma db push (one-off container) + restart app"
REMOTE_DBPUSH=$(cat <<REMOTE_EOF
set -e
echo "  copying schema out of wedding-app..."
docker cp wedding-app:/app/prisma/schema.prisma /tmp/wedding-schema.prisma
echo "  schema copied: \$(wc -c < /tmp/wedding-schema.prisma) bytes"
echo "  running prisma db push in one-off container..."
docker run --rm \\
  -v ${VPS_DB_VOLUME}:/data \\
  -v /tmp/wedding-schema.prisma:/schema.prisma:ro \\
  -e DATABASE_URL=file:/data/custom.db \\
  node:20-bookworm-slim sh -c "apt-get update -qq && apt-get install -y -qq openssl && cd /tmp && npm init -y && npm install prisma@5.22.0 --no-save && node node_modules/prisma/build/index.js db push --schema=/schema.prisma --skip-generate --accept-data-loss"
echo "  prisma db push complete"
echo "  restarting wedding-app so it picks up the new schema..."
docker restart wedding-app
REMOTE_EOF
)
if ! vps "${REMOTE_DBPUSH}"; then
  fail_vps "prisma db push or container restart failed."
fi
ok "Schema pushed + app restarted"

# ─── Step 11/12: Wait for container healthy (after restart) ───────────────────
step 11 "${TOTAL_STEPS}" "VPS: wait for healthy after restart (max ${HEALTH_TIMEOUT_SEC}s)"
if ! vps "${REMOTE_WAIT_FOR_HEALTHY}"; then
  fail_vps "Container did not become healthy after restart."
fi
ok "Container healthy after restart"

# ══════════════════════════════════════════════════════════════════════════════
# VERIFY PRODUCTION
# ══════════════════════════════════════════════════════════════════════════════

# ─── Step 12/12: Verify production endpoints ──────────────────────────────────
step 12 "${TOTAL_STEPS}" "Verify production endpoints"

HEALTH_RESP="/tmp/deploy-vps-health-resp.json"
THEME_RESP="/tmp/deploy-vps-theme-resp.json"
HOME_RESP="/tmp/deploy-vps-home-resp.html"

check_http_200() {
  # check_http_200 <url> <outfile> <label>
  local url="$1"
  local outfile="$2"
  local label="$3"
  local code
  code="$(curl -sS -L -o "${outfile}" -w '%{http_code}' --max-time 30 "${url}" || echo "000")"
  if [ "${code}" != "200" ]; then
    err "${label}: HTTP ${code} (expected 200)"
    err "  url: ${url}"
    err "  body (first 20 lines):"
    head -20 "${outfile}" 2>/dev/null | sed 's/^/    /' >&2 || true
    return 1
  fi
  ok "${label}: HTTP 200 (${url})"
  return 0
}

if ! check_http_200 "${PRODUCTION_URL}/api/health" "${HEALTH_RESP}" "Health"; then
  fail_health "Health endpoint did not return 200."
fi

# Validate the JSON body actually contains status:ok (defends against a
# reverse proxy returning 200 from a stale cache while the app is broken).
if ! python3 -c "import json,sys; d=json.load(open('${HEALTH_RESP}')); sys.exit(0 if d.get('status')=='ok' else 1)"; then
  err "Health endpoint returned 200 but JSON status is not 'ok'."
  err "  body:"
  cat "${HEALTH_RESP}" | sed 's/^/    /' >&2
  fail_health "Health JSON status != ok"
fi
ok "Health JSON: status=ok"

if ! check_http_200 "${PRODUCTION_URL}/api/theme?slug=josue-hornella" "${THEME_RESP}" "Theme (josue-hornella)"; then
  fail_health "Theme endpoint did not return 200."
fi
# Sanity: theme JSON should contain a primaryColor field.
if ! python3 -c "import json,sys; d=json.load(open('${THEME_RESP}')); sys.exit(0 if 'primaryColor' in d else 1)"; then
  err "Theme endpoint returned 200 but JSON is missing primaryColor."
  err "  body:"
  cat "${THEME_RESP}" | sed 's/^/    /' >&2
  fail_health "Theme JSON missing primaryColor"
fi
ok "Theme JSON: primaryColor present"

if ! check_http_200 "${PRODUCTION_URL}/" "${HOME_RESP}" "Homepage"; then
  fail_health "Homepage did not return 200."
fi

# ══════════════════════════════════════════════════════════════════════════════
# SUCCESS
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🎉  PRODUCTION DEPLOY COMPLETE"
echo ""
echo "  🌐 URL:        ${PRODUCTION_URL}"
echo "  📊 Health:     ${PRODUCTION_URL}/api/health"
echo "  🎨 Theme:      ${PRODUCTION_URL}/api/theme?slug=josue-hornella"
echo "  🔧 GitHub:     ${GITHUB_CLEAN_URL}"
echo "  📌 Commit:     ${PUSHED_HASH}"
echo "  🕐 Deployed:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "═══════════════════════════════════════════════════════════════"
exit "${EXIT_SUCCESS}"

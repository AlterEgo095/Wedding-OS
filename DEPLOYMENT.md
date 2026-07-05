# AENEWS Wedding OS — Deployment Guide

**RC-2.0** | 2026-07-05

---

## Prerequisites

- Docker 24+ with docker-compose v2
- A server with ports 80 + 443 available (for Caddy/Nginx reverse proxy)
- Secrets ready: `JWT_SECRET` (32+ random chars), `ENCRYPTION_KEY` (32-byte hex)

## Quick Deploy (existing VPS)

```bash
cd /opt/wedding-platform
git pull origin main
./scripts/deploy-production.sh
```

The script:
1. Verifies clean working tree + VPS HEAD == origin/main
2. Exports `DEPLOY_SHA` + `BUILD_TIME` for runtime provenance
3. Builds the Docker image (passes SHA as build arg)
4. Recreates the container
5. Waits for health
6. Verifies runtime `deploySha` matches git HEAD
7. Smoke-tests critical routes

## Full Deploy (new VPS)

```bash
# 1. Clone the repo
git clone https://github.com/AlterEgo095/Wedding-OS.git /opt/wedding-platform
cd /opt/wedding-platform

# 2. Create .env from example
cp .env.example .env
# Edit .env:
#   DATABASE_URL=file:/app/db/custom.db
#   JWT_SECRET=<32+ random chars>
#   ENCRYPTION_KEY=<32-byte hex>
#   NODE_ENV=production

# 3. Configure Caddy/Nginx reverse proxy
#    (see Caddyfile for the heureuxmariage.aenews.net config)

# 4. Deploy
./scripts/deploy-production.sh

# 5. Verify
curl https://your-domain/api/health
# → { "status": "ok", "deploySha": "<sha>", ... }
```

## What the Docker entrypoint does

On container start, `docker-entrypoint.sh`:
1. Fixes volume permissions (`chown nextjs:nodejs /app/db/`)
2. Runs `init-db.js` (idempotent seed: default wedding + admin user)
3. Runs `prisma migrate deploy` (applies all migrations including
   `1_add_draft_manifest`) — falls back to `prisma db push` if migrate fails
4. Runs `prisma generate` (ensures client is up to date)
5. Starts the Next.js standalone server (`node server.js`)

**Non-destructive**: never runs `migrate reset` or `db push --force-reset`.
The DB volume is preserved across container recreations.

## Environment Variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | `file:/app/db/custom.db` |
| `JWT_SECRET` | ✅ | Admin JWT signing (32+ chars) |
| `ENCRYPTION_KEY` | ✅ | Guest token AES-256-GCM (32-byte hex) |
| `NODE_ENV` | ✅ | `production` |
| `DEPLOY_SHA` | auto | Injected by deploy script (build arg) |
| `BUILD_TIME` | auto | Injected by deploy script (build arg) |
| `PENPOT_API_TOKEN` | optional | For Penpot frame sync (not required for runtime) |
| `REDIS_URL` | optional | For rate-limiting (falls back to in-memory) |

## Post-Deploy Verification

```bash
# 1. Health + provenance
curl -s https://your-domain/api/health | jq .
# → deploySha should match git HEAD

# 2. Public routes
curl -s -o /dev/null -w "%{http_code}" https://your-domain/
curl -s -o /dev/null -w "%{http_code}" https://your-domain/w/josue-hornella

# 3. Platform admin
curl -s -o /dev/null -w "%{http_code}" https://your-domain/platform/admin
# → 200 (redirects to login if not authenticated)

# 4. Tenant isolation (should be 401 without auth)
curl -s -o /dev/null -w "%{http_code}" https://your-domain/api/guests
```

## Updating

```bash
cd /opt/wedding-platform
git pull origin main
./scripts/deploy-production.sh
```

The script handles everything. No manual DB operations needed — migrations
run automatically in the container entrypoint.

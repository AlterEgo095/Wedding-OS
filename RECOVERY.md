# AENEWS Wedding OS — Recovery Procedures

**RC-2.0** | 2026-07-05

---

## Git Recovery Tags + Branches

The following durable references exist on GitHub + VPS:

| Ref | SHA | Purpose |
|---|---|---|
| `recovery/pre-mission-4` (branch) | `642169f` | Mission 4.0 starting point |
| `pre-mission-4-20260705` (tag) | `642169f` | Same, as immutable tag |
| `recovery/vps-production-before-sync` (branch) | `880d70b` | Pre-GitHub-sync VPS state |
| `vps-prod-pre-sync-20260705` (tag) | `880d70b` | Same, as immutable tag |

## Rollback to a known-good state

If production is broken after a deploy:

```bash
cd /opt/wedding-platform

# 1. Identify the last known-good SHA
git log --oneline -10

# 2. Check out that SHA (detached HEAD — safe, does not move main)
git checkout <known-good-sha>

# 3. Rebuild + redeploy
./scripts/deploy-production.sh

# 4. If the rollback fixes it, force-push main back (ONLY with explicit authorization)
#    git push origin <known-good-sha>:main --force-with-lease
```

## Database Recovery

The production DB lives in a Docker volume `wedding-db` mounted at
`/app/db/custom.db` inside the container.

### Backup (non-destructive)

```bash
# Stop the container to get a consistent snapshot (optional but safest)
docker stop wedding-app

# Copy the DB out of the volume
docker cp wedding-app:/app/db/custom.db /opt/wedding-backups/custom-$(date +%Y%m%d-%H%M%S).db

# Restart
docker start wedding-app
```

### Restore from backup

```bash
docker stop wedding-app
docker cp /opt/wedding-backups/custom-YYYYMMDD-HHMMSS.db wedding-app:/app/db/custom.db
docker start wedding-app
# Verify health
curl https://wedding.aenews.store/api/health
```

### Full disaster recovery (VPS lost)

If the VPS is completely lost:

```bash
# 1. Provision a new VPS
# 2. Install Docker + docker-compose
# 3. Clone the repo
git clone https://github.com/AlterEgo095/Wedding-OS.git /opt/wedding-platform
cd /opt/wedding-platform

# 4. Create .env from secrets (JWT_SECRET, ENCRYPTION_KEY, etc.)
cp .env.example .env
# edit .env with production secrets

# 5. Deploy
./scripts/deploy-production.sh

# 6. Restore the latest DB backup
docker cp /path/to/latest-backup.db wedding-app:/app/db/custom.db
docker restart wedding-app

# 7. Verify
curl https://wedding.aenews.store/api/health
# → deploySha should match GitHub main SHA
```

## Schema Recovery

If the DB schema is corrupted or out of sync:

```bash
# Check current schema vs migrations
docker exec wedding-app node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRawUnsafe('PRAGMA table_info(WeddingCollectionBinding)')
    .then(cols => { console.log(cols.map(c => c.name)); return p.\$disconnect(); });
"

# If draftManifest is missing, the migration 1_add_draft_manifest will add it
# on next container restart (docker-entrypoint runs `prisma migrate deploy`).
docker restart wedding-app
```

## Provenance Verification

At any time, verify the 3 SHA match:

```bash
# GitHub main
git ls-remote origin refs/heads/main | cut -f1

# VPS HEAD
git rev-parse HEAD

# Runtime deploySha
curl -s https://wedding.aenews.store/api/health | python3 -c "import sys,json;print(json.load(sys.stdin)['deploySha'])"
```

All three MUST be identical. If not, the deployment is not certified.

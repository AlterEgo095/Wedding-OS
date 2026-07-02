# Backup & Restore Strategy

**Document owner:** Platform team
**Last updated:** P1P2-INFRA (Caddyfile + Prisma baseline + backup docs)
**Status:** Living document — the *current* state below is the actual production state at time of writing; the *recommended* state is what we should converge on.

---

## 1. Current state (as of writing)

| Aspect | State | Risk |
|---|---|---|
| DB engine | SQLite (`db/custom.db`) on a single Docker volume `wedding-db` | Single disk failure = total platform data loss |
| Backups | **Manual, ad-hoc.** Operator SSHes into the VPS and runs a one-off script. | RPO = "whenever someone remembers" (likely weeks stale) |
| Existing manual snapshots | `vps-backups/vps-live-2026-06-29.db` (278 KB) + `vps-backups/backup-summary-*.json` (×2) | Not automated; not offsite; not encrypted at rest |
| Restore procedure | **Undocumented.** Operator would `docker cp` the snapshot back into the container. | RTO undefined; high probability of operator error under stress |
| WAL handling | Not addressed. SQLite WAL mode (`db/custom.db-wal`, `db/custom.db-shm`) means a raw `.db` copy may be transactionally inconsistent. | Manual `cp custom.db …` may produce a corrupt backup |
| Offsite copy | None. Snapshots live on the same VPS disk as the live DB. | Fire/theft/disk failure takes both production AND backup |

### Risk summary

> **Single disk failure on the VPS = total platform data loss** — every wedding, every guest, every invoice, every audit log. The 2 manual snapshots in `vps-backups/` are themselves on the same disk as the source DB. This is an existential risk for a multi-tenant SaaS that has paying customers (Premium/Élite plans).

---

## 2. Recommended setup

Two complementary options. Pick **A (LiteStream)** for low-RPO continuous replication, and/or **B (cron + offsite)** for point-in-time snapshots with long retention. The two options work well together; LiteStream covers the "last 60 seconds" and the cron snapshots cover "the last 30 days".

### Option A — LiteStream sidecar (recommended, RPO ~1s)

[LiteStream](https://litestream.io/) is a standalone tool that streams the SQLite WAL to S3-compatible storage in near-real-time. On a single-node VPS deployment it is the single highest-leverage change you can make for backup safety.

**Sidecar addition to `docker-compose.prod.yml`** (DO NOT apply blindly — review, then add as a sibling service alongside `app`):

```yaml
services:
  litestream:
    image: litestream/litestream:0.3.13
    container_name: wedding-litestream
    restart: unless-stopped
    depends_on:
      app:
        condition: service_healthy
    volumes:
      # Share the DB volume READ-ONLY so litestream can never corrupt the live DB.
      - wedding-db:/app/db:ro
      - ./litestream.yml:/etc/litestream.yml:ro
    environment:
      LITESTREAM_ACCESS_KEY_ID:     ${LITESTREAM_ACCESS_KEY_ID}
      LITESTREAM_SECRET_ACCESS_KEY: ${LITESTREAM_SECRET_ACCESS_KEY}
    command: ["replicate", "-config", "/etc/litestream.yml"]
    deploy:
      resources:
        limits:
          memory: 64M
          cpus: '0.25'
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "2"
    security_opt:
      - no-new-privileges:true
```

**`litestream.yml`** (place at project root, next to `docker-compose.prod.yml`):

```yaml
dbs:
  - path: /app/db/custom.db
    replicas:
      - type: s3
        bucket: heureuxmariage-litestream
        path: custom.db
        region: eu-west-1
        # Endpoint override for S3-compatible providers
        # (Backblaze B2, Cloudflare R2, MinIO, Wasabi, …).
        # endpoint: s3.eu-central-003.backblazeb2.com
        retention: 168h          # keep 7 days of WAL frames
        snapshot-interval: 24h   # full snapshot daily
        sync-interval: 1s        # RPO target
```

**S3 bucket policy** (minimum privilege — the litestream IAM user can only touch objects under `custom.db*` in this bucket):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::heureuxmariage-litestream"],
      "Condition": {"StringLike": {"s3:prefix": ["custom.db*"]}}
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::heureuxmariage-litestream/custom.db*"]
    }
  ]
}
```

**RPO:** ~1 second (LiteStream sync interval). **RTO:** minutes (download snapshot + replay WAL).

---

### Option B — Cron + offsite copy (point-in-time snapshots, 30-day retention)

Use [ofelia](https://github.com/mcuadros/ofelia) (a Docker-native cron scheduler) or a plain `alpine:latest` container with `crond` to run a daily `.backup` + S3 sync. This gives you point-in-time snapshots you can browse, restore partially, or hand to a customer.

**Sidecar addition to `docker-compose.prod.yml`:**

```yaml
services:
  backup:
    image: mcuadros/ofelia:latest
    container_name: wedding-backup
    restart: unless-stopped
    depends_on:
      app:
        condition: service_healthy
    volumes:
      - wedding-db:/app/db:ro                # read-only access to live DB
      - wedding-backups:/backups              # local staging before offsite copy
      - ./backup.sh:/backup.sh:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro   # ofelia needs this for job-exec
    command: daemon --config /etc/ofelia/config.ini
    environment:
      AWS_ACCESS_KEY_ID:     ${BACKUP_AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${BACKUP_AWS_SECRET_ACCESS_KEY}
      BACKUP_S3_BUCKET:      ${BACKUP_S3_BUCKET}      # e.g. heureuxmariage-backups
      BACKUP_S3_PREFIX:      ${BACKUP_S3_PREFIX}      # e.g. db/
    deploy:
      resources:
        limits:
          memory: 64M
          cpus: '0.25'
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "2"
    security_opt:
      - no-new-privileges:true

volumes:
  wedding-backups:
    driver: local
```

**`backup.sh`** (the script `ofelia` invokes daily at 03:00 UTC):

```bash
#!/bin/sh
set -eu

DB=/app/db/custom.db
TS=$(date -u +%Y%m%d-%H%M%S)
OUT=/backups/custom-${TS}.db

# sqlite3 .backup takes a consistent snapshot even with WAL mode enabled
# (it coordinates with the writer; no need to stop the app).
sqlite3 "$DB" ".backup '$OUT'"

# Compress to save bandwidth + storage.
gzip -9 "$OUT"

# Offsite copy — keep 30 days on S3 via lifecycle rule on the bucket.
aws s3 cp "${OUT}.gz" "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}$(basename "${OUT}.gz")" \
  --sse AES256 --no-progress

# Local retention: 7 days (S3 lifecycle handles 30-day retention).
find /backups -name 'custom-*.db.gz' -mtime +7 -delete
```

**Ofelia config (`ofelia.ini`):**

```ini
[job-exec "daily-db-backup"]
schedule = 0 3 * * *
container = wedding-backup
command = sh /backup.sh
```

**S3 bucket lifecycle rule:** transition objects under `db/` to Glacier Instant Retrieval after 7 days, expire after 30 days.

**RPO:** 24 hours (one snapshot per day). **RTO:** minutes (download + `docker cp`).

---

## 3. Restore procedure

### Restore from a LiteStream replica

```bash
# 1. STOP the app so no new writes conflict with the restored DB.
docker compose -f docker-compose.prod.yml stop app

# 2. Pull the latest snapshot + replay WAL into a fresh .db file.
docker run --rm \
  -v wedding-db:/data \
  -v ./litestream.yml:/etc/litestream.yml:ro \
  -e LITESTREAM_ACCESS_KEY_ID=$LITESTREAM_ACCESS_KEY_ID \
  -e LITESTREAM_SECRET_ACCESS_KEY=$LITESTREAM_SECRET_ACCESS_KEY \
  litestream/litestream:0.3.13 \
  restore -config /etc/litestream.yml -o /data/custom.db

# 3. (Optional) restore to a specific point in time.
# docker run --rm … litestream/litestream:0.3.13 \
#   restore -config /etc/litestream.yml -o /data/custom.db -timestamp 2026-07-02T10:30:00Z

# 4. Verify the file is non-empty + has the expected tables.
sqlite3 /var/lib/docker/volumes/wedding-db/_data/custom.db \
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# 5. Restart the app.
docker compose -f docker-compose.prod.yml start app

# 6. Smoke-test: hit /api/health, then load the homepage and the admin dashboard.
curl -fsS http://127.0.0.1:3080/api/health | jq .
```

### Restore from a daily `.db.gz` snapshot

```bash
# 1. STOP the app.
docker compose -f docker-compose.prod.yml stop app

# 2. Move the corrupt live DB aside (don't delete — forensics).
docker run --rm -v wedding-db:/data alpine \
  sh -c 'mv /data/custom.db /data/custom.db.corrupt-$(date +%s)'

# 3. Download + decompress the snapshot from S3.
aws s3 cp s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}custom-20260702-030000.db.gz /tmp/
gunzip /tmp/custom-20260702-030000.db.gz

# 4. Copy the snapshot into the volume.
docker cp /tmp/custom-20260702-030000.db wedding-app:/app/db/custom.db

# 5. Fix ownership (the container runs as nextjs:nodejs uid 1001).
docker run --rm -v wedding-db:/data alpine \
  sh -c 'chown 1001:1001 /data/custom.db && chmod 660 /data/custom.db'

# 6. Restart the app + smoke-test as above.
docker compose -f docker-compose.prod.yml start app
curl -fsS http://127.0.0.1:3080/api/health | jq .
```

### Restore from the existing manual snapshot (`vps-backups/vps-live-2026-06-29.db`)

This is the **emergency-only** path for the current state (no LiteStream / no cron yet):

```bash
# 1. Stop the app.
docker compose -f docker-compose.prod.yml stop app

# 2. Replace the live DB with the manual snapshot.
docker cp vps-backups/vps-live-2026-06-29.db wedding-app:/app/db/custom.db
docker run --rm -v wedding-db:/data alpine \
  sh -c 'chown 1001:1001 /data/custom.db && chmod 660 /data/custom.db'

# 3. Restart the app + smoke-test.
docker compose -f docker-compose.prod.yml start app
```

> ⚠️ **Caveat for the manual snapshot:** it was taken with `cp custom.db …` (NOT `sqlite3 .backup`), so if WAL mode was active at the time the snapshot may be missing the most recent committed transactions. After restoring, run a `PRAGMA integrity_check;` and audit recent rows in `AuditLog` / `GuestAccessLog` to gauge data loss.

---

## 4. Backup verification (weekly test-restore)

A backup you haven't tested restoring is not a backup — it's a hope. Weekly verification:

1. **Provision a staging instance** (separate Docker Compose project, separate volume, separate port — e.g. `3081`).
2. **Restore the latest backup** into staging following Section 3.
3. **Run a smoke-test script:**
   ```bash
   curl -fsS http://127.0.0.1:3081/api/health
   curl -fsS http://127.0.0.1:3081/ | grep -q "Josué"
   curl -fsS -X POST http://127.0.0.1:3081/api/admin/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@heureuxmariage.aenews.net","password":"<staging-only-password>"}' \
     | jq -e '.token' >/dev/null
   sqlite3 /var/lib/docker/volumes/staging-wedding-db/_data/custom.db \
     "SELECT COUNT(*) FROM Wedding; SELECT COUNT(*) FROM Guest; SELECT COUNT(*) FROM AdminUser;"
   ```
4. **Compare row counts** against the source DB — they should match (within 1 for the WAL tail if LiteStream is the source).
5. **Tear down staging** (`docker compose -f docker-compose.staging.yml down -v`).
6. **Alert if any step fails** — page the on-call engineer.

The script lives at `scripts/verify-backup.sh` (to be created in a follow-up; out of scope for this P1P2-INFRA task).

---

## 5. What to add to `docker-compose.prod.yml` (deferred)

This P1P2-INFRA task only **documents** the recommended additions — it does NOT modify `docker-compose.prod.yml` (a separate task owns the compose file). The follow-up work items are:

| ID | Work item | Effort | Blocks |
|---|---|---|---|
| BACKUP-1 | Add `litestream` sidecar service + `litestream.yml` + S3 bucket + IAM user | S | None |
| BACKUP-2 | Add `backup` (ofelia) sidecar service + `backup.sh` + `ofelia.ini` | S | None |
| BACKUP-3 | Provision S3 bucket with lifecycle rule (Glacier IR after 7d, expire after 30d) + bucket policy | S | BACKUP-1 or BACKUP-2 |
| BACKUP-4 | Add `LITESTREAM_*` / `BACKUP_AWS_*` env vars to `.env` (NEVER commit secrets) | S | BACKUP-1 |
| BACKUP-5 | Write `scripts/verify-backup.sh` + wire to a weekly cron on the VPS host (not in Docker) | S | BACKUP-1 |
| BACKUP-6 | Document the restore runbook in the team wiki + run a live fire-drill | S | BACKUP-1 |

Order of operations: BACKUP-3 (bucket) → BACKUP-1 (LiteStream) → BACKUP-4 (env) → BACKUP-5 (verify) → BACKUP-2 (cron, optional redundancy) → BACKUP-6 (drill).

---

## 6. Operational notes

- **WAL mode:** SQLite WAL mode is on by default in Prisma's SQLite driver. A raw `cp custom.db …` produces a corrupt backup because the WAL file (`custom.db-wal`) is not copied. ALWAYS use `sqlite3 .backup` (Option B), `litestream restore` (Option A), or stop the app first.
- **Volume mount mode:** Both sidecars mount `wedding-db` as `:ro` (read-only). This is a deliberate safety: even if the sidecar is compromised, it cannot corrupt the live DB.
- **Secrets:** `LITESTREAM_*` and `BACKUP_AWS_*` credentials MUST live in `.env` (gitignored), never in `docker-compose*.yml` or `litestream.yml`.
- **Encryption at rest:** S3 server-side encryption (`--sse AES256` in `aws s3 cp`) covers the offsite copy. For LiteStream, enable SSE on the bucket itself.
- **Multi-region:** For Premium/Élite customers with strict DR requirements, replicate the S3 bucket cross-region (S3 replication, or Backblaze B2 replication). Out of scope for MVP.
- **Test restores:** At least ONE test restore per month, into a staging instance, with row-count verification. A backup you haven't restored is not a backup.

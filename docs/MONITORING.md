# ══════════════════════════════════════════════════════════════════════════════
# docs/MONITORING.md — Wedding Platform monitoring & error-reporting story.
# ══════════════════════════════════════════════════════════════════════════════

## TL;DR

| Layer | What we have today | What we recommend next |
|-------|-------------------|-----------------------|
| **Logs** | Structured JSON to stdout via `src/lib/logger.ts`. Docker `json-file` driver rotates at 10 MB × 3 files. | Ship to Loki / CloudWatch / Datadog via a log forwarder (Promtail, Fluent Bit, etc.). |
| **Health** | `GET /api/health` → 200 `{status:"ok", checks:{database:{...}, env:{...}}}`. Used by Docker HEALTHCHECK + deploy workflow. | Add an external uptime monitor (UptimeRobot, Pingdom) hitting `/api/health` every 60s. |
| **Errors** | `src/lib/sentry.ts` thin shim → forwards to `logger.error` today. `uncaughtException` + `unhandledRejection` are captured by `src/lib/instrumentation-node.ts` and routed through the same shim. | Wire up `@sentry/nextjs` (5-line change — see below). |
| **Metrics** | None built-in. Docker exposes CPU/memory via `docker stats`. | Add `@vercel/otel` or a Prometheus exporter when the team grows. |
| **Backups** | See `docs/BACKUP.md` — manual today, LiteStream + cron recommended. | Same — out of scope here. |

---

## 1. Structured logs (`src/lib/logger.ts`)

Every log call emits ONE JSON line to stdout:

```json
{"ts":"2025-01-15T12:34:56.789Z","level":"info","msg":"login success","env":"production","pid":42,"userId":"abc","email":"x@y.com"}
```

### Levels

| Level    | Priority | When to use                                                  |
|----------|----------|--------------------------------------------------------------|
| `debug`  | 10       | Verbose dev-only diagnostics. Dropped in production.         |
| `info`   | 20       | Normal operations (login success, wedding created).          |
| `warn`   | 30       | Recoverable issue (rate limit hit, retry, fallback used).    |
| `error`  | 40       | Unexpected failure (DB error, unhandled rejection).          |
| `silent` | —        | Disables all output. Useful for tests.                       |

Default level: `debug` in dev, `info` in production. Override with `LOG_LEVEL=warn` (etc.).

### Usage

```ts
import { logger } from '@/lib/logger';

logger.info('login success', { userId: user.id, email: user.email });

const requestLogger = logger.with({ requestId, userId });
requestLogger.warn('rate limit hit', { ip });

try { await risky() }
catch (err) { logger.error('db write failed', { err, action: 'create-wedding' }) }
```

**Stack traces are NOT logged by default** (P1-SEC-15: stacks can leak source paths + captured secrets). Opt in for dev-only debugging with `{ includeStack: true }`.

### Grepping logs by level

The Docker `json-file` driver writes to `/var/lib/docker/containers/<id>/<id>-json.log` on the host. On the production VPS:

```bash
# Tail live logs from the container:
docker logs -f wedding-app

# Last 100 errors only (jq filters on the `level` field):
docker logs wedding-app 2>&1 | jq -c 'select(.level=="error")' | tail -100

# All warnings + errors in the last hour:
docker logs --since 1h wedding-app 2>&1 | jq -c 'select(.level=="warn" or .level=="error")'

# All logs tagged with a specific request id:
docker logs wedding-app 2>&1 | jq -c 'select(.requestId=="req_abc123")'

# Count errors by message (top 10):
docker logs wedding-app 2>&1 | jq -r 'select(.level=="error") | .msg' | sort | uniq -c | sort -rn | head -10
```

### Log rotation

`docker-compose.prod.yml` configures the json-file driver:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

So the on-disk log footprint is capped at ~30 MB per container. Older entries are lost — that's why a log forwarder (Promtail / Fluent Bit) is the recommended next step.

---

## 2. Health endpoint (`/api/health`)

- **URL:** `GET /api/health`
- **Auth:** NONE (intentional — must be reachable without credentials).
- **Response (200):**
  ```json
  {
    "status": "ok",
    "timestamp": "2025-01-15T12:34:56.789Z",
    "uptimeSec": 3600,
    "version": "0.2.0",
    "env": "production",
    "checks": {
      "database": { "status": "ok", "latencyMs": 2 },
      "env": { "status": "ok" }
    },
    "totalLatencyMs": 3
  }
  ```
- **Response (503):** same shape, but `status: "degraded"` and at least one check has `status: "fail"`. The DB error message is sanitised in production (P2-SEC-8).

Used by:
1. Docker `HEALTHCHECK` directive in `Dockerfile` (every 30s).
2. The deploy workflow (`.github/workflows/deploy.yml`) waits for the container health check + then hits `https://wedding.hpph.net/api/health` as a final smoke test.
3. External uptime monitors (recommended — see TL;DR).

---

## 3. Error reporting (`src/lib/sentry.ts`)

Today, `captureException(err, ctx)` and `captureMessage(msg, level)` are thin shims that forward to `logger.error` / `logger.warn` / `logger.info`. They're consumed by:

- `src/lib/instrumentation-node.ts` — `uncaughtException` + `unhandledRejection` handlers.
- Anywhere in app code that wants to surface an error to the monitoring pipeline without coupling to a specific vendor.

The shim is opt-in: zero new dependencies, zero build-time risk. When the team is ready to adopt Sentry for real, the migration is exactly 5 lines.

### Wiring up Sentry (when ready)

1. Install the SDK:
   ```bash
   bun add @sentry/nextjs
   ```
2. Run the wizard (writes `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` + adds the `withSentryConfig` wrapper to `next.config.ts`):
   ```bash
   bunx @sentry/wizard@latest -i nextjs
   ```
3. Edit `src/lib/sentry.ts` and replace the logger fallback with real Sentry calls:
   ```ts
   import * as Sentry from '@sentry/nextjs';

   export function captureException(error: unknown, context?: Record<string, unknown>) {
     Sentry.captureException(error, { extra: context });
   }

   export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
     Sentry.captureMessage(message, level);
   }
   ```
4. Set `SENTRY_DSN` in `.env` (see `.env.example`).
5. (Optional, for source maps) Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in the GitHub Actions env so `next build` uploads source maps on every CI run.

That's it. `src/lib/instrumentation-node.ts` already routes `uncaughtException` / `unhandledRejection` through `captureException`, so all unhandled errors will start landing in Sentry automatically.

### Why we don't ship `@sentry/nextjs` by default

- It's ~600 KB minified and pulls in a non-trivial runtime that hooks into the Next.js build.
- The Sentry Next.js SDK has historically lagged behind Next.js major releases, breaking builds (the wizard regenerates config; a manual install against an unsupported Next.js version emits cryptic Webpack errors).
- For a single-tenant wedding platform with low traffic, structured stdout logs + Docker's json-file driver + `jq` is sufficient. Sentry's value (release tracking, source maps, breadcrumbs, session replays) justifies the cost when traffic + team size grow.

---

## 4. What to alert on

Once a log forwarder + alerting layer are in place, these are the highest-signal queries:

| Signal | Query (jq) | Suggested threshold |
|--------|-----------|---------------------|
| Unhandled errors | `select(.msg=="sentry-capture")` | > 5 in 5 min → page |
| DB unreachable | `select(.msg=="Health check DB failure")` | > 0 in 1 min → page |
| Login flood | `select(.msg=="rate limit hit" and .endpoint=="/api/admin/login")` | > 20 in 1 min → investigate (credential stuffing?) |
| Guest lookup abuse | `select(.msg=="rate limit hit" and .endpoint=="/api/guest/lookup")` | > 50 in 1 min → investigate (scraping?) |
| Prisma constraint violations | `select(.errCode=="P2002")` | > 0 → bug (unique constraint violation) |
| Prisma connection drops | `select(.errCode=="P1001")` | > 0 in 1 min → page |

---

## 5. See also

- `docs/BACKUP.md` — backup + restore procedures (SQLite + LiteStream + cron).
- `src/lib/logger.ts` — the structured logger source (JSDoc'd design decisions).
- `src/lib/sentry.ts` — the error-reporting shim source.
- `src/lib/instrumentation-node.ts` — graceful shutdown + unhandled error handlers.
- `.github/workflows/deploy.yml` — production deploy workflow (uses `/api/health` as the final smoke test).

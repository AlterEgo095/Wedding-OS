// ══════════════════════════════════════════════════════════════════════════════
// src/lib/redis.ts — OPTIONAL Redis connection helper (P1-SEC-14).
// ══════════════════════════════════════════════════════════════════════════════
//
// ⚠️  ioredis is NOT in package.json by default. It is an OPTIONAL peer
// dependency: when REDIS_URL is set in the environment, callers are expected
// to have run `bun add ioredis` first. If REDIS_URL is set but ioredis is
// missing, `getRedis()` logs a one-shot warning and returns null — callers
// fall back to in-memory behavior (per-instance rate limiting, which is
// still better than nothing for single-container deploys).
//
// WHY OPTIONAL:
//   The Wedding Platform is currently a single-container Next.js app (see
//   docker-compose.prod.yml). For single-container deploys, in-memory rate
//   limiting is sufficient. Multi-instance rate limiting (Redis) only
//   becomes necessary when the app is scaled horizontally (e.g. behind a
//   load balancer with 2+ replicas). Bundling ioredis unconditionally
//   would add ~200 KB to node_modules + a runtime TCP connection attempt
//   on every cold start, even when Redis is unused.
//
// ENABLEMENT (3 steps):
//   1. `bun add ioredis`
//   2. Set `REDIS_URL=redis://localhost:6379` (or your provider URL) in `.env`
//   3. Restart the app. `getRedis()` auto-detects REDIS_URL, dynamically
//      imports ioredis, and caches the connection for the process lifetime.
//
// DESIGN:
//   - `getRedis()` is async (returns Promise<ioredis | null>) because it
//     dynamically imports ioredis on first call. Subsequent calls return
//     the cached instance synchronously (the await is a no-op).
//   - `lazyConnect: true` + explicit `connect()` lets us catch connection
//     errors at init time rather than on the first INCR.
//   - `maxRetriesPerRequest: 1` ensures a rate-limit check fails fast (1
//     retry, then returns the error) rather than blocking for the default
//     20s. Rate limiting is best-effort — a Redis outage should NOT block
//     logins, it should fall back to in-memory.
//   - On init failure (ioredis missing OR connection refused), we set a
//     `redisInitFailed` flag so subsequent `getRedis()` calls return null
//     immediately without retrying. A process restart is required to
//     re-attempt — by design, so a flapping Redis doesn't spam logs.
// ══════════════════════════════════════════════════════════════════════════════

// RedisLike is intentionally `any` — ioredis's TypeScript types are heavy
// and we don't want to force every caller to depend on them. The instance
// is created dynamically and we only call a small surface (incr, expire,
// connect, disconnect).
export type RedisLike = any;

let redisInstance: RedisLike = null;
let redisInitFailed = false;

/**
 * Returns a connected ioredis instance, or null if Redis is not configured
 * (no REDIS_URL) or could not be initialised (ioredis missing / connection
 * refused).
 *
 * Callers MUST handle the null case by falling back to in-memory behavior.
 */
export async function getRedis(): Promise<RedisLike | null> {
  // Already initialised — return cached instance.
  if (redisInstance) return redisInstance;

  // Previously failed — don't retry on every request (would spam logs).
  if (redisInitFailed) return null;

  // No REDIS_URL configured — feature is off.
  if (!process.env.REDIS_URL) return null;

  try {
    // Dynamic import so ioredis is only loaded when actually needed.
    // If ioredis is not installed, this throws MODULE_NOT_FOUND.
    // @ts-ignore — ioredis is an OPTIONAL peer dep; not installed by default.
    const IORedis = (await import('ioredis')).default;
    const client = new IORedis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      // Don't crash the process on a Redis error — log + fall back.
      enableOfflineQueue: false,
    });

    // Explicitly connect so we can catch connection errors at init time.
    await client.connect().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      // P1-SEC-1 (structured logging) — but we can't import logger here
      // without risking a circular dep (logger might want redis one day
      // for log shipping). Use console.warn with a JSON-shaped payload.
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          msg: 'redis-connect-failed',
          errMessage: msg,
          fallback: 'in-memory-rate-limit',
        })
      );
      redisInitFailed = true;
      redisInstance = null;
    });

    if (!redisInitFailed) {
      redisInstance = client;
    }
    return redisInstance;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isModuleMissing =
      msg.includes("Cannot find module") || msg.includes('MODULE_NOT_FOUND');
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'warn',
        msg: 'redis-init-failed',
        errMessage: msg,
        hint: isModuleMissing
          ? 'REDIS_URL is set but ioredis is not installed. Run `bun add ioredis` to enable Redis-backed rate limiting.'
          : undefined,
        fallback: 'in-memory-rate-limit',
      })
    );
    redisInitFailed = true;
    return null;
  }
}

/**
 * Returns true if a Redis client is currently connected.
 * Does NOT trigger a connection attempt — purely a status check.
 * Useful for /api/health or /api/admin/metrics.
 */
export function isRedisConnected(): boolean {
  return redisInstance !== null && !redisInitFailed;
}

/**
 * Clears the cached Redis instance + failure flag. Intended for tests that
 * flip process.env.REDIS_URL between cases. Not used in production.
 */
export function __resetRedisForTests(): void {
  if (redisInstance && typeof redisInstance.disconnect === 'function') {
    try {
      redisInstance.disconnect();
    } catch {
      // ignore — best-effort cleanup
    }
  }
  redisInstance = null;
  redisInitFailed = false;
}

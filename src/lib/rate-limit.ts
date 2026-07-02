import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from './redis';

// ─── In-memory Rate Limiting ───
const rateLimits = new Map<string, { count: number; resetTime: number }>();

export function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || 'unknown';
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimits.get(key);

  if (!record || now > record.resetTime) {
    rateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// checkRateLimitAsync — P1-SEC-14: Redis-backed rate limiting (with fallback).
// ══════════════════════════════════════════════════════════════════════════════
//
// Same contract as `checkRateLimit`, but:
//   - When a Redis client is available (REDIS_URL set + ioredis installed +
//     connection succeeded), uses an atomic INCR + EXPIRE on a window-scoped
//     key so the limit is shared across all app instances (horizontal scale).
//   - Otherwise falls back to the in-memory `checkRateLimit` — still safe for
//     single-container deploys.
//
// Returns `{ allowed, retryAfterSeconds? }`. `retryAfterSeconds` is populated
// only when the limit is exceeded (used for the `Retry-After` header).
//
// The Redis key is `rl:<identifier>:<window-start>` where window-start is
// `floor(now / windowMs)`. This makes the counter auto-roll at the window
// boundary without a background sweeper. The EXPIRE on first INCR ensures the
// key is evicted shortly after the window closes.
export async function checkRateLimitAsync(
  identifier: string,
  max: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const redis = await getRedis();
  if (redis) {
    try {
      const windowStart = Math.floor(Date.now() / windowMs);
      const key = `rl:${identifier}:${windowStart}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }
      if (count > max) {
        return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
      }
      return { allowed: true };
    } catch (err) {
      // Redis error — fall through to in-memory
      console.warn('rate-limit redis error, falling back to in-memory', err);
    }
  }
  // In-memory fallback (existing logic)
  const allowed = checkRateLimit(identifier, max, windowMs);
  if (!allowed) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)) };
  }
  return { allowed: true };
}

// ─── Security Headers Helper ───
export function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

// ══════════════════════════════════════════════════════════════════════════════
// withRateLimit — P2-SEC-6
// ══════════════════════════════════════════════════════════════════════════════
//
// Higher-order function that wraps a POST/PUT/DELETE handler with rate
// limiting. Before this helper, 44 of 50 API routes had NO rate limit — any
// anonymous client could flood expensive endpoints (create-wedding,
// guests/import, theme/save, etc.).
//
// The helper:
//   - Computes a key via `keyFn(req)` (default: IP-based getRateLimitKey).
//   - Calls `checkRateLimitAsync(key, max, windowMs)` to consume a slot.
//     (Redis-backed when configured; in-memory fallback otherwise.)
//   - On limit exceeded: returns 429 with the canonical French copy and a
//     `Retry-After` header (seconds until the window resets).
//   - On limit OK: calls the wrapped handler with all original args.
//
// Usage (route handler):
//   export const POST = withRateLimit(20, 60_000)(
//     async (req: NextRequest) => { ... return NextResponse.json(...) }
//   )
//
// Usage (with custom key — e.g. per-user rather than per-IP):
//   export const POST = withRateLimit(5, 60_000, (req) => getUserId(req) ?? getRateLimitKey(req))(
//     async (req) => { ... }
//   )
//
// Note: the returned HOF preserves Next.js dynamic route params (the second
// positional arg to a route handler is `{ params }`). The `Args extends
// unknown[]` generic forwards them transparently.

export function withRateLimit(
  max: number,
  windowMs: number,
  keyFn: (req: NextRequest) => string = getRateLimitKey
): <Args extends unknown[]>(
  handler: (req: NextRequest, ...args: Args) => Promise<NextResponse>
) => (req: NextRequest, ...args: Args) => Promise<NextResponse> {
  return <Args extends unknown[]>(
    handler: (req: NextRequest, ...args: Args) => Promise<NextResponse>
  ): ((req: NextRequest, ...args: Args) => Promise<NextResponse>) => {
    return async (req: NextRequest, ...args: Args): Promise<NextResponse> => {
      const key = keyFn(req);
      const { allowed, retryAfterSeconds } = await checkRateLimitAsync(key, max, windowMs);
      if (!allowed) {
        // P2-CQ-5: canonical French 429 copy (no trailing period).
        // Retry-After is in SECONDS per RFC 7231 §7.1.3.
        const retry = retryAfterSeconds ?? Math.max(1, Math.ceil(windowMs / 1000));
        return NextResponse.json(
          { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
          {
            status: 429,
            headers: { 'Retry-After': String(retry) },
          }
        );
      }
      return handler(req, ...args);
    };
  };
}

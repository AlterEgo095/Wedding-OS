import { NextRequest, NextResponse } from 'next/server';

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
//   - Calls `checkRateLimit(key, max, windowMs)` to consume a slot.
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
      const allowed = checkRateLimit(key, max, windowMs);
      if (!allowed) {
        // P2-CQ-5: canonical French 429 copy (no trailing period).
        // Retry-After is in SECONDS per RFC 7231 §7.1.3.
        const retryAfterSeconds = Math.max(1, Math.ceil(windowMs / 1000));
        return NextResponse.json(
          { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
          {
            status: 429,
            headers: { 'Retry-After': String(retryAfterSeconds) },
          }
        );
      }
      return handler(req, ...args);
    };
  };
}

export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════════════════════
// POST /api/platform/experience/track — Public event tracking endpoint.
// Mission 6.0 Phase 3.4 — Experience Manager.
// ════════════════════════════════════════════════════════════════════════════
//
// Called from the guest frontend via `navigator.sendBeacon()` (and `fetch()`
// as fallback). MUST be:
//   - Public (no auth — guests are anonymous)
//   - CORS-enabled (the wedding site may be on a custom domain)
//   - Beacon-friendly (returns 204 No Content with no body — beacons can't
//     read responses, and a 204 keeps the connection teardown clean)
//   - Rate-limited (100 req/min per IP — soft anti-abuse; a determined
//     attacker can still flood, but the in-memory counter stops naive floods)
//
// Body shape:
//   { weddingSlug, guestId?, eventType, sectionId?, variantId?, payload? }
//
// The wedding is resolved by SLUG (not id) because the public frontend only
// knows the slug from the URL. An invalid slug → 404 (we still return 204 to
// the beacon to avoid retries; for non-beacon callers we return 404 JSON).
//
// We do NOT enforce that the sectionId/variantId exist in the DB — tracking
// is fire-and-forget; we record what the client sent so we can detect
// mismatches between published config and actual impressions.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

// ─── CORS ────────────────────────────────────────────────────────────────────
//
// The wedding site may be served from a custom domain (e.g. mariage-sophie.fr)
// while the API is on the platform domain. sendBeacon() requires CORS pre-flight
// for non-simple requests (POST with Content-Type: application/json triggers it).
//
// We allow ALL origins (`*`) because:
//   - The endpoint is read-only from the client's perspective (writes an event
//     row, returns 204 — no sensitive data is ever returned).
//   - The wedding slug is public (it's in the URL).
//   - Rate limiting + payload size cap are the abuse vectors, not auth.
//
// For OPTIONS preflight, we respond with 204 + CORS headers.

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Content-Length',
  'Access-Control-Max-Age': '86400', // 24h — cache preflight in browser
};

// ─── Rate limit: 100 req/min per IP ─────────────────────────────────────────
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// ─── Zod validation ──────────────────────────────────────────────────────────
//
//eventType is a free-form string (clients may introduce new event types
// without a schema migration), but we cap length to prevent abuse.
const trackSchema = z.object({
  weddingSlug: z.string().min(1).max(120),
  guestId: z.string().max(120).optional().nullable(),
  eventType: z.string().min(1).max(60),
  sectionId: z.string().max(120).optional().nullable(),
  variantId: z.string().max(120).optional().nullable(),
  payload: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    // ─── Rate limit (per IP) ─────────────────────────────────────────────────
    const ipKey = `exp-track:${getRateLimitKey(request)}`;
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(
      ipKey,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS
    );
    if (!allowed) {
      // 429 with Retry-After; still CORS-enabled so the browser can read it.
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        {
          status: 429,
          headers: {
            ...CORS_HEADERS,
            'Retry-After': String(retryAfterSeconds ?? 60),
          },
        }
      );
    }

    // ─── Parse + validate body ───────────────────────────────────────────────
    //
    // sendBeacon() sends as `text/plain` by default (the browser ignores the
    // `type` arg in many cases). We accept both JSON-typed and text-typed
    // payloads and parse leniently.
    let body: unknown = null;
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      body = null;
    }
    if (!body || typeof body !== 'object') {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    const parsed = trackSchema.safeParse(body);
    if (!parsed.success) {
      // Malformed payload — return 204 for beacon (no retry), 400 for fetch callers.
      // We can't tell which one is calling, so we err on the side of "beacon
      // won't retry" and return 204.
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }
    const data = parsed.data;

    // ─── Resolve wedding by slug ─────────────────────────────────────────────
    const wedding = await db.wedding.findUnique({
      where: { slug: data.weddingSlug },
      select: { id: true },
    });
    if (!wedding) {
      // Unknown slug — return 204 (beacon-friendly, no retry). Log at debug
      // so we can spot misconfigured sites without flooding prod logs.
      logger.warn('experience.track: wedding slug not found', {
        slug: data.weddingSlug,
      });
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    // ─── Persist event (best-effort) ────────────────────────────────────────
    //
    // Failure to write the event row MUST NOT surface as an error to the
    // beacon (it would retry forever). We log + return 204 regardless.
    try {
      await db.experienceEvent.create({
        data: {
          weddingId: wedding.id,
          guestId: data.guestId || null,
          eventType: data.eventType,
          sectionId: data.sectionId || null,
          variantId: data.variantId || null,
          payloadJson: JSON.stringify(data.payload ?? {}),
        },
      });
    } catch (dbErr) {
      logger.error('experience.track: DB write failed (non-fatal)', {
        weddingId: wedding.id,
        eventType: data.eventType,
        errMessage: dbErr instanceof Error ? dbErr.message : String(dbErr),
      });
    }

    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  } catch (err) {
    // Top-level catch — never surface the error to the client (beacon-safe).
    logger.error('experience.track: unhandled error', {
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }
}

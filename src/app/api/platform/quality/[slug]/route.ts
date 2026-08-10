// ══════════════════════════════════════════════════════════════════════════════
// /api/platform/quality/[slug]/route.ts — Phase 4B quality scorecard API
// ══════════════════════════════════════════════════════════════════════════════
//
// GET /api/platform/quality/{slug}
//
// Returns the per-wedding 9-dimension `QualityScorecard` JSON. Auth:
// PLATFORM_ADMIN only (the scorecard surfaces wedding-internal state like
// story counts + media counts that should not be exposed to guests or
// per-wedding organizers other than the wedding owner).
//
// Caching:
//   - `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` — the
//     response is cacheable by the browser + CDN for 60s, with a 5-min
//     stale-while-revalidate window. The underlying data is itself ISR-cached
//     (`getCachedWeddingData` + `getCachedWeddingPageData`, both tagged
//     `wedding-{slug}`), so a cache hit at any layer is consistent with the
//     latest published state.
//   - The route does NOT call `revalidateTag` — it relies on the publish
//     pipeline's existing invalidation for cache busting.
//
// Error handling:
//   - 401 if not authenticated.
//   - 403 if not PLATFORM_ADMIN.
//   - 404 if the wedding slug doesn't resolve.
//   - 500 on unexpected errors (logged via logger).

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withSecurityHeaders } from '@/lib/rate-limit';
import { computeQualityScorecard } from '@/lib/quality/scorecard';
import { logger } from '@/lib/logger';
import { internalError, notFound, badRequest } from '@/lib/api-errors';
import { writeAuditLog } from '@/lib/audit';
import { db } from '@/lib/db';

// Force dynamic — the response varies per slug + per-user auth, so it must
// not be statically pre-rendered at build time.
export const dynamic = 'force-dynamic';

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    // ── Auth: PLATFORM_ADMIN only ────────────────────────────────────────
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    // ── Resolve slug ─────────────────────────────────────────────────────
    const { slug } = await params;
    if (!slug || typeof slug !== 'string') {
      return notFound('Slug de mariage invalide');
    }

    // ── Compute scorecard ────────────────────────────────────────────────
    const scorecard = await computeQualityScorecard(slug);
    if (!scorecard) {
      // Wedding doesn't exist (slug didn't resolve in the cache layer).
      return notFound('Mariage introuvable');
    }

    // ── Return with cache headers ────────────────────────────────────────
    const response = NextResponse.json(scorecard);
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=300',
    );
    return withSecurityHeaders(response);
  } catch (error) {
    logger.error('quality.scorecard API error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/platform/quality/{slug} — force-publish audit log entry
// ══════════════════════════════════════════════════════════════════════════════
//
// Body: `{ overall: number, threshold: number, dimensions: [{id,label,score,status}] }`
//
// Writes an audit-log entry recording that a PLATFORM_ADMIN overrode the
// quality gate for this wedding. The audit entry includes the scorecard
// summary so investigators can reconstruct what was published despite the
// low score.
//
// This endpoint does NOT itself publish the wedding — the actual publish is
// performed by the existing POST /api/weddings/[id]/design route (unchanged).
// The DesignerTab client calls this audit endpoint first, then proceeds with
// the normal publish flow.
//
// Auth: PLATFORM_ADMIN only.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    // ── Auth: PLATFORM_ADMIN only ────────────────────────────────────────
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    // ── Resolve slug + weddingId ─────────────────────────────────────────
    const { slug } = await params;
    if (!slug || typeof slug !== 'string') {
      return notFound('Slug de mariage invalide');
    }
    const wedding = await db.wedding.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!wedding) {
      return notFound('Mariage introuvable');
    }

    // ── Parse body (best-effort) ─────────────────────────────────────────
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return badRequest('Corps de requête invalide');
    }
    const overall = typeof body.overall === 'number' ? body.overall : null;
    const threshold = typeof body.threshold === 'number' ? body.threshold : null;

    // ── Write audit log (non-fatal — never throws) ───────────────────────
    await writeAuditLog({
      weddingId: wedding.id,
      userId: user?.id ?? null,
      action: 'quality.force_publish',
      details: `Override quality gate (overall=${overall ?? '?'}/100, threshold=${threshold ?? '?'}) — publication forcée par admin plateforme`,
      request,
      targetType: 'WEDDING',
      targetResourceId: wedding.id,
    });

    return withSecurityHeaders(NextResponse.json({ ok: true }));
  } catch (error) {
    logger.error('quality.force-publish audit error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

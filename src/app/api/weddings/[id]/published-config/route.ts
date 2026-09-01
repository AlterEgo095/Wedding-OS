export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { apiError, internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { safeJsonParse } from '@/lib/safe-json';

/**
 * Public published-config endpoint (CONS-6-PIPELINE task 3).
 *
 * GET /api/weddings/{id}/published-config
 *   → 200 { published: true, config, version }
 *   → 200 { published: false }   (no deployment yet)
 *
 * PUBLIC — no auth required. Cached at the CDN edge for 60s with a 5-min
 * stale-while-revalidate window so high-traffic weddings don't hammer the
 * DB on every page view.
 *
 * Used by /w/[slug]/page.tsx (client) to fetch the published config when
 * not already provided via the WeddingContext (e.g. for guest-side polling
 * after a redeploy). The server-side layout.tsx reads publishedConfigJson
 * directly via `db` (no HTTP round-trip).
 */

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return apiError('Wedding id required', 400);

    // Light input validation — cuid pattern (24 lowercase alphanumeric).
    const idSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) {
      return apiError('Invalid wedding id', 400);
    }

    const wedding = await db.wedding.findUnique({
      where: { id: parsed.data },
      select: {
        id: true,
        slug: true,
        status: true,
        publishedConfigJson: true,
        publishedVersion: true,
      },
    });

    if (!wedding) {
      return NextResponse.json(
        { error: 'Mariage introuvable' },
        { status: 404, headers: CACHE_HEADERS }
      );
    }

    // P1-3 (sprint P1): status gate — la config publiée n'est servie que
    // pour les mariages PUBLISHED. Auparavant, tout mariage possédant un
    // publishedConfigJson (UNPUBLISHED après retrait, brouillon showcase…)
    // exposait sa config ici. La page publique est gated par middleware/layout ;
    // cette route ne doit pas devenir un canal parallèle.
    if (wedding.status !== 'PUBLISHED') {
      return NextResponse.json(
        { published: false, weddingId: wedding.id, reason: 'not-published' },
        { status: 200, headers: CACHE_HEADERS }
      );
    }

    if (!wedding.publishedConfigJson) {
      // No deployment yet — return a not-published sentinel. Still 200 so
      // the client can branch on `published` without try/catch.
      return NextResponse.json(
        { published: false, weddingId: wedding.id },
        { status: 200, headers: CACHE_HEADERS }
      );
    }

    const config = safeJsonParse<unknown>(wedding.publishedConfigJson, null);
    if (!config) {
      logger.warn('published-config: malformed JSON', { weddingId: wedding.id });
      return NextResponse.json(
        { published: false, weddingId: wedding.id, error: 'malformed' },
        { status: 200, headers: CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        published: true,
        weddingId: wedding.id,
        slug: wedding.slug,
        version: wedding.publishedVersion,
        config,
      },
      { status: 200, headers: CACHE_HEADERS }
    );
  } catch (error) {
    logger.error('published-config error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

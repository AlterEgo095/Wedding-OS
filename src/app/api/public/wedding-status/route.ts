export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/public/wedding-status?slug=xxx — Lightweight slug existence check
// ══════════════════════════════════════════════════════════════════════════════
// P5.0 CB-1 — Used by middleware to validate wedding slugs BEFORE the request
// reaches the layout. This allows the middleware to return a real HTTP 404
// (instead of the soft-404 HTTP 200 that Next.js 16's layout-level notFound()
// produces).
//
// Security: this endpoint is NOT CSRF-protected (GET) and does NOT require auth.
// It only returns existence + status + isDefault — no sensitive data (no couple
// names, no venue, no guest info). The status field is needed so the middleware
// can block DRAFT weddings on public (non-admin) routes.
//
// Performance: the middleware caches the response for 30 seconds (in-memory),
// so this endpoint is hit at most once every 30s per unique slug.
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug || slug.length > 200) {
    return NextResponse.json(
      { exists: false, status: null, isDefault: false },
      { status: 200 }
    );
  }

  try {
    const wedding = await db.wedding.findUnique({
      where: { slug },
      select: { status: true, isDefault: true },
    });

    if (!wedding) {
      return NextResponse.json(
        { exists: false, status: null, isDefault: false },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        exists: true,
        status: wedding.status,
        isDefault: wedding.isDefault,
      },
      { status: 200 }
    );
  } catch {
    // On DB error, fail open (let the layout handle it)
    return NextResponse.json(
      { exists: true, status: 'PUBLISHED', isDefault: false },
      { status: 200 }
    );
  }
}

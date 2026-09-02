export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/public/org-status?slug=xxx — Lightweight org slug existence check
// ══════════════════════════════════════════════════════════════════════════════
// P3-UX (sprint premium tranche 2, PX-8 hardening) — Used by middleware to
// validate ORGANIZATION slugs for the PUBLIC org page (/org/{slug}, exact
// path only) BEFORE the request reaches the page. This allows the middleware
// to return a real HTTP 404 (instead of the soft-404 HTTP 200 that Next.js
// 16's page-level notFound() produces) for:
//   1. Unknown organizations
//   2. Non-ACTIVE organizations (SUSPENDED / ARCHIVED) on the public page
//
// Mirrors /api/public/wedding-status (P5.0 CB-1) — same posture:
//   - NOT CSRF-protected (GET), no auth required.
//   - Returns ONLY existence + status — no org name, no plan, no quotas,
//     no member data.
//   - On DB error, fails OPEN (exists: true, status: 'ACTIVE') so the page
//     itself remains the handler of last resort (its own gate still renders
//     the not-found UI — worst case stays a soft-404, never a data leak).
//   - The middleware caches the response for 30 seconds (in-memory).
// Admin routes (/org/{slug}/admin/*) and /org/signup are NOT gated by this
// endpoint — operators must never be locked out of the back-office.
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug || slug.length > 200) {
    return NextResponse.json(
      { exists: false, status: null },
      { status: 200 }
    );
  }

  try {
    const org = await db.organization.findUnique({
      where: { slug },
      select: { status: true },
    });

    if (!org) {
      return NextResponse.json(
        { exists: false, status: null },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { exists: true, status: org.status },
      { status: 200 }
    );
  } catch {
    // On DB error, fail open (let the page handle it)
    return NextResponse.json(
      { exists: true, status: 'ACTIVE' },
      { status: 200 }
    );
  }
}

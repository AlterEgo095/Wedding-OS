export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isCustomDomainRequest } from '@/lib/custom-domains';

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/resolve-domain?host=xxx — Custom domain resolver (Slice 5)
// ══════════════════════════════════════════════════════════════════════════════
// Called by middleware to resolve a custom domain to a wedding slug.
// Returns { slug } if found, { slug: null } if not.
//
// The middleware rewrites the URL to /w/[slug] when a custom domain is detected.
// This endpoint is NOT CSRF-protected (it's a GET) and does NOT require auth
// (it only returns a slug, no sensitive data).
// ══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const host = request.nextUrl.searchParams.get('host');
  if (!host) return NextResponse.json({ slug: null });

  const normalized = host.toLowerCase().trim().split(':')[0];
  if (!isCustomDomainRequest(normalized)) return NextResponse.json({ slug: null });

  const wedding = await db.wedding.findFirst({
    where: { customDomain: normalized, status: { in: ['PUBLISHED'] } },
    select: { slug: true },
  });

  return NextResponse.json({ slug: wedding?.slug ?? null });
}

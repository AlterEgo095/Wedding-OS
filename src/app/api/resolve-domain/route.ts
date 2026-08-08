export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isCustomDomainRequest } from '@/lib/custom-domains';
import { logger } from '@/lib/logger';

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/resolve-domain?host=xxx — Custom domain resolver (Slice 5 + P1.10)
// ══════════════════════════════════════════════════════════════════════════════
// Called by middleware to resolve a custom domain to a wedding OR organization slug.
//
// Resolution order (P1.10):
//   1. Wedding table — Wedding.customDomain === host AND status === 'PUBLISHED'
//      → returns { slug, type: 'wedding' }
//   2. Organization table — Organization.customDomain === host AND status === 'ACTIVE'
//      → returns { slug, type: 'org' }
//   3. No match → returns { slug: null, type: null }
//
// The middleware uses `type` to decide the rewrite target:
//   - 'wedding' → /w/[slug]  (existing behaviour, Slice 5)
//   - 'org'     → /org/[slug] (NEW P1.10 — org-level white-label landing page;
//                              the /org/[slug] route itself is created in P1.8)
//
// Backward compatibility: the previous response shape was `{ slug }` (string |
// null). The new shape is `{ slug, type }`. The middleware was updated in P1.10
// to read both fields; any external caller that only reads `slug` continues to
// work (the slug field is still present, type is additive).
//
// Security: this endpoint is NOT CSRF-protected (GET) and does NOT require auth.
// It only returns a slug + type discriminator — no sensitive data. The host
// parameter is normalized (lowercase, port-stripped) before any DB lookup to
// prevent trivial bypasses via case/host:port variations.
// ══════════════════════════════════════════════════════════════════════════════

export type CustomDomainType = 'wedding' | 'org' | null;

export interface CustomDomainResolution {
  slug: string | null;
  type: CustomDomainType;
}

export async function GET(request: NextRequest): Promise<Response> {
  const host = request.nextUrl.searchParams.get('host');
  if (!host) {
    return NextResponse.json<CustomDomainResolution>({ slug: null, type: null });
  }

  const normalized = host.toLowerCase().trim().split(':')[0];
  if (!isCustomDomainRequest(normalized)) {
    return NextResponse.json<CustomDomainResolution>({ slug: null, type: null });
  }

  // ─── 1. Wedding lookup (existing Slice 5 behaviour) ──────────────────────
  // Only PUBLISHED weddings are resolvable via custom domain — DRAFT/SUSPENDED
  // weddings remain hidden (defence-in-depth, matches the public layout gate).
  //
  // P5.2-2 (PRE-P5.X-AUDIT-B, HIGH-4): only VERIFIED custom domains resolve.
  // A couple that just typed `google.com` into the custom-domain field will
  // see `customDomainVerified = false` and the domain won't route until they
  // prove ownership via the TXT record (see /api/weddings/{id}/verify-domain).
  try {
    const wedding = await db.wedding.findFirst({
      where: {
        customDomain: normalized,
        status: { in: ['PUBLISHED'] },
        customDomainVerified: true,
      },
      select: { slug: true },
    });
    if (wedding?.slug) {
      return NextResponse.json<CustomDomainResolution>({
        slug: wedding.slug,
        type: 'wedding',
      });
    }
  } catch (err) {
    // Log + fall through to org lookup. A wedding-table failure should NOT
    // block org-domain resolution (the two tables are independent).
    logger.error('resolve-domain: wedding lookup failed', {
      host: normalized,
      err,
    });
  }

  // ─── 2. Organization lookup (NEW P1.10) ──────────────────────────────────
  // Only ACTIVE organizations are resolvable. SUSPENDED/ARCHIVED orgs lose
  // their custom-domain routing (the org admin must reactivate to restore).
  try {
    const org = await db.organization.findFirst({
      where: { customDomain: normalized, status: 'ACTIVE' },
      select: { slug: true },
    });
    if (org?.slug) {
      return NextResponse.json<CustomDomainResolution>({
        slug: org.slug,
        type: 'org',
      });
    }
  } catch (err) {
    logger.error('resolve-domain: organization lookup failed', {
      host: normalized,
      err,
    });
  }

  // ─── 3. No match ─────────────────────────────────────────────────────────
  return NextResponse.json<CustomDomainResolution>({ slug: null, type: null });
}

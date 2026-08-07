export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getOrgQuotaStatus } from '@/lib/org-quotas';
import { internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';

/**
 * GET /api/org/[slug]/quotas
 *
 * P2.8 — Returns the org's 3 quota statuses (weddings, members, invitations/month).
 * Used by the org admin dashboard to display quota usage bars.
 *
 * Response shape:
 *   {
 *     orgName: string,
 *     quotas: {
 *       weddings:     { allowed, current, limit, organizationId, metric },
 *       members:      { allowed, current, limit, organizationId, metric },
 *       invitations:  { allowed, current, limit, organizationId, metric, period }
 *     }
 *   }
 *
 * Auth: ORG_ADMIN / ORG_MEMBER / ORG_VIEWER (any ACTIVE member of the org)
 *       OR a platform admin (cross-tenant).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const rlKey = getRateLimitKey(request);
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(rlKey, 30, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds ?? 60) } },
      );
    }

    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: 'Slug requis' }, { status: 400 });
    }

    const org = await db.organization.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!org) {
      return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
    }

    // Verify membership (ACTIVE) OR platform-admin bypass.
    // Import isPlatformAdmin inline to avoid pulling the full types module
    // into the hot path on every quota check.
    const { isPlatformAdmin } = await import('@/lib/types');
    if (!isPlatformAdmin(user.role)) {
      const membership = await db.organizationMember.findFirst({
        where: { organizationId: org.id, userId: user.id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!membership) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
      }
    }

    const quotas = await getOrgQuotaStatus(org.id);
    return NextResponse.json({ orgName: org.name, quotas });
  } catch (error) {
    logger.error('Get org quotas error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';
import { getWeddingQuotaStatus } from '@/lib/plan-limits';
import { internalError } from '@/lib/api-errors';

/**
 * GET /api/weddings/[id]/quotas
 *
 * Returns the wedding's 4 quota statuses (guests, admins, media, invitations).
 * Used by the admin dashboard to display quota usage bars.
 *
 * Response shape:
 *   {
 *     quotas: {
 *       guests:       { current, limit, plan },
 *       admins:       { current, limit, plan },
 *       media:        { currentBytes, limitBytes, plan },
 *       invitations:  { current, limit, plan }
 *     }
 *   }
 *
 * `limit === -1` (or `limitBytes === -1`) means unlimited.
 *
 * Tenant-scoped: the weddingId in the URL must match the resolved tenant
 * weddingId (withAdminTenantHandler enforces this).
 *
 * Auth: ORGANIZER+ only.
 *
 * P2.9 — Entitlement runtime extension.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const { id: weddingId } = await params;
      if (weddingId !== ctx.weddingId) {
        return NextResponse.json({ error: 'Wedding mismatch' }, { status: 403 });
      }
      const quotas = await getWeddingQuotaStatus(weddingId);
      return NextResponse.json({ quotas });
    });
  } catch (error) {
    return internalError();
  }
}

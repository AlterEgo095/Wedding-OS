export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withPublicTenant, withAdminTenantHandler } from '@/lib/tenant-context';
import { getAuthUser } from '@/lib/auth';
import { hasRole } from '@/lib/types';
import { computeQualityScore } from '@/lib/collections/quality';

/**
 * GET /api/collections/[id]/quality — compute + return the quality score.
 *
 * Phase 5 — Penpot Collection Builder.
 *
 * Query params:
 *   ?skipCache=1  — compute without writing to Collection.qualityScore (dry-run)
 *
 * Public read (withPublicTenant) — couples + guests can see the score badge.
 * The full section breakdown is returned regardless of role (no sensitive data).
 *
 * Response (200): QualityReport
 */
export const GET = withPublicTenant(async (req: NextRequest) => {
  try {
    const id = req.nextUrl.pathname.split('/').slice(-2, -1)[0] as string;
    const skipCache = req.nextUrl.searchParams.get('skipCache') === '1';

    const report = await computeQualityScore(id, { skipCache });
    return NextResponse.json(report);
  } catch (error) {
    console.error('Quality score error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

/**
 * POST /api/collections/[id]/quality — force re-compute + cache the score.
 *
 * Auth: DESIGNER+ (only designers / art directors / admins trigger recompute).
 * The GET endpoint also computes (and caches by default), so POST is only
 * needed when a designer wants to force-refresh after a Penpot re-sync.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasRole(user.role, ['DESIGNER'])) {
    return NextResponse.json(
      { error: 'Forbidden — réservé aux designers+' },
      { status: 403 }
    );
  }

  return withAdminTenantHandler(request, user, async () => {
    try {
      const id = request.nextUrl.pathname.split('/').slice(-2, -1)[0] as string;
      const report = await computeQualityScore(id, { skipCache: false });
      return NextResponse.json(report);
    } catch (error) {
      console.error('Quality score POST error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

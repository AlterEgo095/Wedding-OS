export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';

/**
 * PATCH /api/platform/weddings/[id]/portfolio
 *
 * Update portfolio governance fields for a wedding:
 *   - portfolioVisible (boolean | null)
 *   - portfolioType ('CLIENT' | 'DEMO' | 'INTERNAL' | null)
 *   - portfolioOrder (number | null)
 *   - caseStudyEnabled (boolean)
 *   - featured (boolean)
 *
 * Platform admin only. Used by the Marketing Administration UI to govern
 * which events appear in the homepage portfolio, their classification,
 * ordering, and case-study status.
 *
 * Mission 4.7 Phase 4 — replaces implicit slug-based classification.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id: weddingId } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const {
      portfolioVisible,
      portfolioType,
      portfolioOrder,
      caseStudyEnabled,
      featured,
    } = body as {
      portfolioVisible?: boolean | null;
      portfolioType?: string | null;
      portfolioOrder?: number | null;
      caseStudyEnabled?: boolean;
      featured?: boolean;
    };

    // Validate portfolioType if provided
    const validTypes = ['CLIENT', 'DEMO', 'INTERNAL'];
    if (portfolioType !== undefined && portfolioType !== null && !validTypes.includes(portfolioType)) {
      return badRequest(`portfolioType doit être l'un de: ${validTypes.join(', ')}`);
    }

    // Build update data (only include provided fields)
    const updateData: Record<string, unknown> = {};
    if (portfolioVisible !== undefined) updateData.portfolioVisible = portfolioVisible;
    if (portfolioType !== undefined) updateData.portfolioType = portfolioType;
    if (portfolioOrder !== undefined) updateData.portfolioOrder = portfolioOrder;
    if (caseStudyEnabled !== undefined) updateData.caseStudyEnabled = caseStudyEnabled;
    if (featured !== undefined) updateData.featured = featured;

    // If enabling caseStudy for this wedding, disable it for all others (only 1 case study)
    if (caseStudyEnabled === true) {
      await db.wedding.updateMany({
        where: { id: { not: weddingId }, caseStudyEnabled: true },
        data: { caseStudyEnabled: false },
      });
    }

    const wedding = await db.wedding.update({
      where: { id: weddingId },
      data: updateData,
      select: {
        id: true,
        slug: true,
        coupleLabel: true,
        portfolioVisible: true,
        portfolioType: true,
        portfolioOrder: true,
        caseStudyEnabled: true,
        featured: true,
      },
    });

    await writeAuditLog({
      weddingId: null,
      userId: user!.id,
      action: 'PORTFOLIO_GOVERNANCE_UPDATED',
      details: `Updated portfolio governance for ${wedding.slug}: ${JSON.stringify(updateData)}`,
      request,
    });

    return NextResponse.json({ success: true, wedding });
  } catch (error) {
    logger.error('Portfolio governance update error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

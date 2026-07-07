export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';

/**
 * PATCH /api/platform/collections/[id]/governance
 *
 * Update Collection marketing governance:
 *   - isActive (boolean) — controls catalog visibility
 *   - isPublished (boolean) — controls deployability
 *   - sortOrder (number) — controls marketing display order
 *   - marketingVisible (boolean) — NEW: explicit marketing visibility flag
 *     (stored in Collection.isActive for backward compat — when isActive=false,
 *      the Collection is hidden from BOTH catalog AND marketing)
 *   - featured (boolean) — highlight in marketing
 *
 * Platform admin only. Used by the Marketing Administration UI.
 *
 * Mission 4.7 Phase 5 — Collection Publishing Governance.
 *
 * Lifecycle rules:
 *   - status BROUILLON / EN_COURS → never visible publicly (isActive ignored)
 *   - status ARCHIVE → never visible, never proposed
 *   - status PUBLIE / COMMERCIALISE → visible if isActive=true
 *   - Existing bindings are NOT broken when a Collection is archived (the
 *     manifest is already persisted in WeddingCollectionBinding.manifest)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id: collectionId } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const {
      isActive,
      isPublished,
      sortOrder,
      featured,
      status,
    } = body as {
      isActive?: boolean;
      isPublished?: boolean;
      sortOrder?: number;
      featured?: boolean;
      status?: string;
    };

    // Validate status if provided
    const validStatuses = ['BROUILLON', 'EN_COURS', 'VALIDATION', 'PUBLIE', 'COMMERCIALISE', 'ARCHIVE'];
    if (status !== undefined && !validStatuses.includes(status)) {
      return badRequest(`status doit être l'un de: ${validStatuses.join(', ')}`);
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (status !== undefined) {
      updateData.status = status;
      // Set lifecycle timestamps
      if (status === 'ARCHIVE') updateData.archivedAt = new Date();
      if (status === 'PUBLIE') updateData.publishedAt = new Date();
      if (status === 'COMMERCIALISE') updateData.commercializedAt = new Date();
      if (status === 'VALIDATION') updateData.submittedAt = new Date();
    }

    // featured is stored as a boolean flag — we reuse sortOrder < 0 to indicate
    // featured, or add it as a separate field. For simplicity, we use a negative
    // sortOrder convention: featured collections get sortOrder -1, others >= 0.
    // This avoids a migration. The marketing UI sorts by sortOrder asc.
    if (featured !== undefined) {
      const current = await db.collection.findUnique({ where: { id: collectionId }, select: { sortOrder: true } });
      if (featured) {
        updateData.sortOrder = -1;
      } else if (current && current.sortOrder < 0) {
        updateData.sortOrder = 0;
      }
    }

    const collection = await db.collection.update({
      where: { id: collectionId },
      data: updateData,
      select: {
        id: true,
        slug: true,
        name: true,
        isActive: true,
        isPublished: true,
        sortOrder: true,
        status: true,
        archivedAt: true,
      },
    });

    await writeAuditLog({
      weddingId: null,
      userId: user!.id,
      action: 'COLLECTION_GOVERNANCE_UPDATED',
      details: `Updated governance for ${collection.slug}: ${JSON.stringify(updateData)}`,
      request,
    });

    return NextResponse.json({ success: true, collection });
  } catch (error) {
    logger.error('Collection governance update error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

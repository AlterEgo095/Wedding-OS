export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withPublicTenant } from '@/lib/tenant-context';
import { getCollection } from '@/lib/collections';
import type { Plan } from '@/lib/types';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { badRequest } from '@/lib/api-errors';

/**
 * GET /api/collections/[id] — public detail (with variants), filtered by plan.
 */
export const GET = withPublicTenant(async (req: NextRequest, ctx) => {
  try {
    const id = req.nextUrl.pathname.split('/').pop() as string
    const plan = ctx.plan as Plan
    const collection = await getCollection(id, plan)
    if (!collection) {
      return NextResponse.json({ error: 'Collection introuvable' }, { status: 404 })
    }
    return NextResponse.json({ collection })
  } catch (error) {
    logger.error('Get collection error', { err: error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/collections/[id] — PLATFORM_ADMIN only (Slice 3: Factory CRUD)
// ══════════════════════════════════════════════════════════════════════════════
// Updates a Collection's metadata + themeSeed. Can also publish/unpublish.
//
// Body: { name?, description?, category?, themeSeed?, luxuryPreset?, isPublished?,
//         status?, version? }
// ══════════════════════════════════════════════════════════════════════════════

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden — PLATFORM_ADMIN required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const existing = await db.collection.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Collection introuvable' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.themeSeed !== undefined) updateData.themeSeed = JSON.stringify(body.themeSeed);
    if (body.luxuryPreset !== undefined) updateData.luxuryPreset = body.luxuryPreset ? JSON.stringify(body.luxuryPreset) : null;
    if (body.isPublished !== undefined) updateData.isPublished = body.isPublished;
    if (body.status !== undefined) {
      updateData.status = body.status;
      // Set lifecycle timestamps
      if (body.status === 'PUBLIE' && !existing.publishedAt) updateData.publishedAt = new Date();
      if (body.status === 'COMMERCIALISE' && !existing.commercializedAt) updateData.commercializedAt = new Date();
      if (body.status === 'ARCHIVE' && !existing.archivedAt) updateData.archivedAt = new Date();
    }
    if (body.version !== undefined) updateData.version = body.version;

    const collection = await db.collection.update({
      where: { id },
      data: updateData,
    });

    await writeAuditLog({
      weddingId: user.weddingId || '',
      userId: user.id,
      action: 'UPDATE_COLLECTION',
      details: `Updated Collection "${collection.name}" (${collection.slug}) — fields: ${Object.keys(updateData).join(', ')}`,
      request,
    });

    return NextResponse.json({ success: true, collection });
  } catch (error) {
    logger.error('Update collection error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to update collection', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/collections/[id] — PLATFORM_ADMIN only (Slice 3: Factory CRUD)
// ══════════════════════════════════════════════════════════════════════════════
// Soft-deletes a Collection by setting isActive=false and status=ARCHIVE.
// Hard delete is not allowed if any wedding is currently bound to it.
// ══════════════════════════════════════════════════════════════════════════════

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden — PLATFORM_ADMIN required' }, { status: 403 });
    }

    const { id } = await params;

    // Check if any wedding is bound to this collection
    const boundCount = await db.wedding.count({ where: { collectionId: id } });
    if (boundCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${boundCount} wedding(s) are currently using this collection. Reassign them first.` },
        { status: 409 }
      );
    }

    // Soft delete: deactivate + archive
    const collection = await db.collection.update({
      where: { id },
      data: {
        isActive: false,
        isPublished: false,
        status: 'ARCHIVE',
        archivedAt: new Date(),
      },
    });

    await writeAuditLog({
      weddingId: user.weddingId || '',
      userId: user.id,
      action: 'DELETE_COLLECTION',
      details: `Archived Collection "${collection.name}" (${collection.slug})`,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete collection error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to delete collection' },
      { status: 500 }
    );
  }
}

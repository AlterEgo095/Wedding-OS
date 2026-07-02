export const revalidate = 60; // P2-PERF-10: ISR — public couple-story cached 60s, invalidated on mutation
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withPublicTenant, withAdminTenantHandler } from '@/lib/tenant-context';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError, badRequest } from '@/lib/api-errors';
// P2-SEC-14 + P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';

export const GET = withPublicTenant(async (_req, _ctx) => {
  try {
    const stories = await tenantDb.coupleStory.findMany({
      orderBy: { order: 'asc' },
      take: 50, // P2-PERF-4: bound public list to avoid unbounded scans
      // weddingId auto-injected
    });
    return NextResponse.json({ stories });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('List couple story error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
});

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const body = await request.json().catch(() => null); // P2-CQ-6
      if (!body) return badRequest('Corps de requête invalide');
      const { title, description, date, imageUrl, order } = body;
      if (!title || !description) {
        return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
      }

      const story = await tenantDb.coupleStory.create({
        data: {
          weddingId: ctx.weddingId,
          title, description,
          date: date || null,
          imageUrl: imageUrl || null,
          order: order || 0,
        },
      });

      await writeAuditLog({
        weddingId: ctx.weddingId, userId: user.id,
        action: 'CREATE_COUPLE_STORY',
        details: `Created couple story: ${title}`,
        request,
      });

      // P2-PERF-10: invalidate ISR caches for this resource + public pages.
      revalidatePath('/api/couple-story');
      revalidatePath('/w/[slug]', 'page');
      revalidatePath('/w/[slug]/invite/[code]', 'page');
      revalidatePath('/');

      return NextResponse.json({ story }, { status: 201 });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Create couple story error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const body = await request.json().catch(() => null); // P2-CQ-6
      if (!body) return badRequest('Corps de requête invalide');
      const { id, title, description, date, imageUrl, order } = body;
      if (!id) return NextResponse.json({ error: 'Story ID is required' }, { status: 400 });

      const existing = await tenantDb.coupleStory.findFirst({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Story not found' }, { status: 404 });

      const updateData: Record<string, unknown> = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (date !== undefined) updateData.date = date;
      if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
      if (order !== undefined) updateData.order = order;

      const story = await tenantDb.coupleStory.update({ where: { id }, data: updateData });

      await writeAuditLog({
        weddingId: ctx.weddingId, userId: user.id,
        action: 'UPDATE_COUPLE_STORY',
        details: `Updated couple story: ${existing.title}`,
        request,
      });

      // P2-PERF-10: invalidate ISR caches for this resource + public pages.
      revalidatePath('/api/couple-story');
      revalidatePath('/w/[slug]', 'page');
      revalidatePath('/w/[slug]/invite/[code]', 'page');
      revalidatePath('/');

      return NextResponse.json({ story });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Update couple story error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, ctx) => {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'Story ID is required' }, { status: 400 });

      const existing = await tenantDb.coupleStory.findFirst({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Story not found' }, { status: 404 });

      await tenantDb.coupleStory.delete({ where: { id } });

      await writeAuditLog({
        weddingId: ctx.weddingId, userId: user.id,
        action: 'DELETE_COUPLE_STORY',
        details: `Deleted couple story: ${existing.title}`,
        request,
      });

      // P2-PERF-10: invalidate ISR caches for this resource + public pages.
      revalidatePath('/api/couple-story');
      revalidatePath('/w/[slug]', 'page');
      revalidatePath('/w/[slug]/invite/[code]', 'page');
      revalidatePath('/');

      return NextResponse.json({ message: 'Couple story deleted successfully' });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Delete couple story error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

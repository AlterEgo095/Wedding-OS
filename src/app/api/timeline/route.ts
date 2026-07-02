export const revalidate = 60; // P2-PERF-10: ISR — public timeline cached 60s, invalidated on mutation
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

// GET /api/timeline — public, returns all timeline events for the resolved wedding
export const GET = withPublicTenant(async (_req, _ctx) => {
  try {
    const events = await tenantDb.eventTimeline.findMany({
      orderBy: { order: 'asc' },
      take: 200, // P2-PERF-4: bound public list (no wedding should exceed 200 events)
      // weddingId auto-injected
    });
    return NextResponse.json({ events });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('List timeline error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
});

// POST /api/timeline — admin only, creates a new event in the resolved wedding
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
      const { time, activity, location, description, icon, order } = body;

      if (!time || !activity) {
        return NextResponse.json({ error: 'Time and activity are required' }, { status: 400 });
      }

      const event = await tenantDb.eventTimeline.create({
        data: {
          weddingId: ctx.weddingId, // explicit for clarity (extension would also inject)
          time,
          activity,
          location: location || null,
          description: description || null,
          icon: icon || null,
          order: order || 0,
        },
      });

      await writeAuditLog({
        weddingId: ctx.weddingId,
        userId: user.id,
        action: 'CREATE_TIMELINE',
        details: `Created timeline event: ${activity}`,
        request,
      });

      // P2-PERF-10: invalidate ISR caches for this resource + public pages.
      revalidatePath('/api/timeline');
      revalidatePath('/w/[slug]', 'page');
      revalidatePath('/w/[slug]/invite/[code]', 'page');
      revalidatePath('/');

      return NextResponse.json({ event }, { status: 201 });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Create timeline error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// PUT /api/timeline — admin only, updates an event (must belong to ctx.weddingId)
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
      const { id, time, activity, location, description, icon, order } = body;

      if (!id) return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });

      // Use findFirst to leverage auto-injection of weddingId (prevents cross-tenant access)
      const existing = await tenantDb.eventTimeline.findFirst({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

      const updateData: Record<string, unknown> = {};
      if (time !== undefined) updateData.time = time;
      if (activity !== undefined) updateData.activity = activity;
      if (location !== undefined) updateData.location = location;
      if (description !== undefined) updateData.description = description;
      if (icon !== undefined) updateData.icon = icon;
      if (order !== undefined) updateData.order = order;

      const event = await tenantDb.eventTimeline.update({ where: { id }, data: updateData });

      await writeAuditLog({
        weddingId: ctx.weddingId,
        userId: user.id,
        action: 'UPDATE_TIMELINE',
        details: `Updated timeline event: ${existing.activity}`,
        request,
      });

      // P2-PERF-10: invalidate ISR caches for this resource + public pages.
      revalidatePath('/api/timeline');
      revalidatePath('/w/[slug]', 'page');
      revalidatePath('/w/[slug]/invite/[code]', 'page');
      revalidatePath('/');

      return NextResponse.json({ event });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Update timeline error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// DELETE /api/timeline?id=... — admin only
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
      if (!id) return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });

      const existing = await tenantDb.eventTimeline.findFirst({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

      await tenantDb.eventTimeline.delete({ where: { id } });

      await writeAuditLog({
        weddingId: ctx.weddingId,
        userId: user.id,
        action: 'DELETE_TIMELINE',
        details: `Deleted timeline event: ${existing.activity}`,
        request,
      });

      // P2-PERF-10: invalidate ISR caches for this resource + public pages.
      revalidatePath('/api/timeline');
      revalidatePath('/w/[slug]', 'page');
      revalidatePath('/w/[slug]/invite/[code]', 'page');
      revalidatePath('/');

      return NextResponse.json({ message: 'Timeline event deleted successfully' });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Delete timeline error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

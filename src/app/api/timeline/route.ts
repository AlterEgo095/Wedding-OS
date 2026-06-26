export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withPublicTenant, withAdminTenantHandler } from '@/lib/tenant-context';

// GET /api/timeline — public, returns all timeline events for the resolved wedding
export const GET = withPublicTenant(async (_req, _ctx) => {
  try {
    const events = await tenantDb.eventTimeline.findMany({
      orderBy: { order: 'asc' },
      // weddingId auto-injected
    });
    return NextResponse.json({ events });
  } catch (error) {
    console.error('List timeline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
      const body = await request.json();
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

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId,
          userId: user.id,
          action: 'CREATE_TIMELINE',
          details: `Created timeline event: ${activity}`,
        },
      });

      return NextResponse.json({ event }, { status: 201 });
    });
  } catch (error) {
    console.error('Create timeline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
      const body = await request.json();
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

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId,
          userId: user.id,
          action: 'UPDATE_TIMELINE',
          details: `Updated timeline event: ${existing.activity}`,
        },
      });

      return NextResponse.json({ event });
    });
  } catch (error) {
    console.error('Update timeline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId,
          userId: user.id,
          action: 'DELETE_TIMELINE',
          details: `Deleted timeline event: ${existing.activity}`,
        },
      });

      return NextResponse.json({ message: 'Timeline event deleted successfully' });
    });
  } catch (error) {
    console.error('Delete timeline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

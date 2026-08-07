export const dynamic = 'force-dynamic'; // §11: ISR caused cross-tenant data leaks
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withPublicTenant, withAdminTenantHandler } from '@/lib/tenant-context';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError, badRequest } from '@/lib/api-errors';
// P2-SEC-14 + P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
// CONS-7 task 5: Zod request-body validation.
import { z } from 'zod';

// ══════════════════════════════════════════════════════════════════════════════
// Mission 6.0 — P4.3 — DEPRECATED
// ══════════════════════════════════════════════════════════════════════════════
//
// EventTimeline is DEPRECATED post-P4.3. The canonical model going forward
// is ProgramItem (exposed at /api/weddings/[id]/program). This route is kept
// for backward compatibility with legacy clients (the love-story timeline
// section on /w/[slug] and the admin TimelineManager.tsx). DO NOT build new
// features on top of EventTimeline — new writes should go to ProgramItem.
//
// All responses include the header:
//   X-Deprecated: Use /api/weddings/[id]/program instead
// so HTTP clients can detect deprecation programmatically. The route will be
// removed in P6 (after all clients have migrated).
//
// To migrate an existing wedding's EventTimeline rows into ProgramItem, see:
//   POST /api/weddings/[id]/program/migrate   (platform-admin only)
// And the migration helper:
//   src/lib/wedding/program-merge.ts
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/timeline — public, returns all timeline events for the resolved wedding
// DEPRECATED — use GET /api/weddings/[id]/program instead (reads ProgramItem).
export const GET = withPublicTenant(async (_req, ctx) => {
  try {
    // P4.3: switched from tenantDb to db with explicit weddingId filter.
    // The tenantDb extension has a TS regression post-P3 prisma client regen
    // ("Excessive stack depth comparing types"). Same defence-in-depth as
    // /api/weddings/[id]/program/route.ts — explicit weddingId is functionally
    // equivalent to the auto-inject for our use case.
    const events = await db.eventTimeline.findMany({
      where: { weddingId: ctx.weddingId },
      orderBy: { order: 'asc' },
      take: 200, // P2-PERF-4: bound public list (no wedding should exceed 200 events)
    });
    return NextResponse.json(
      { events },
      {
        headers: {
          'X-Deprecated': 'Use /api/weddings/[id]/program instead',
        },
      },
    );
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('List timeline error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
});

// CONS-7 task 5 — Zod schema for timeline event creation.
const createTimelineSchema = z.object({
  time: z.string().min(1).max(40),
  activity: z.string().min(1).max(200),
  location: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  icon: z.string().max(60).optional().nullable(),
  order: z.number().int().min(0).optional(),
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
      // CONS-7 task 5: Zod validation replaces ad-hoc field checks.
      const parsed = createTimelineSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: 'Données invalides',
            details: parsed.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
          { status: 400 },
        );
      }
      const { time, activity, location, description, icon, order } = parsed.data;

      const event = await db.eventTimeline.create({
        data: {
          weddingId: ctx.weddingId, // explicit for clarity (was previously also auto-injected by tenantDb)
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

      // Use findFirst with explicit weddingId filter — defence-in-depth against
      // cross-tenant access by-id (P4.3: switched from tenantDb to db).
      const existing = await db.eventTimeline.findFirst({ where: { id, weddingId: ctx.weddingId } });
      if (!existing) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

      // P3: Concrete field shape (no index signature) for Prisma Exact<> compat.
      const updateData: {
        time?: string;
        activity?: string;
        location?: string;
        description?: string;
        icon?: string;
        order?: number;
      } = {};
      if (time !== undefined) updateData.time = time;
      if (activity !== undefined) updateData.activity = activity;
      if (location !== undefined) updateData.location = location;
      if (description !== undefined) updateData.description = description;
      if (icon !== undefined) updateData.icon = icon;
      if (order !== undefined) updateData.order = order;

      const event = await db.eventTimeline.update({ where: { id }, data: updateData });

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

      const existing = await db.eventTimeline.findFirst({ where: { id, weddingId: ctx.weddingId } });
      if (!existing) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

      await db.eventTimeline.delete({ where: { id } });

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
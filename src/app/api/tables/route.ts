export const dynamic = 'force-dynamic'; // §11: ISR caused cross-tenant data leaks
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError, badRequest } from '@/lib/api-errors';
// P2-SEC-14 + P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';

// All table operations require auth (tables are admin-only — guests don't see them)
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['CONTROLLER'])) {
      return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
    }

    return withAdminTenantHandler(request, user, async (_req, _ctx) => {
      const tables = await tenantDb.table.findMany({
        include: { _count: { select: { guests: true } } },
        orderBy: { number: 'asc' },
        take: 200, // P2-PERF-4: bound admin list (no wedding should exceed 200 tables)
        // weddingId auto-injected
      });

      const tablesWithCounts = tables.map((t) => ({
        ...t,
        guestCount: t._count.guests,
        _count: undefined,
      }));

      return NextResponse.json({ tables: tablesWithCounts });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('List tables error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

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
      const { name, number, capacity, location } = body;
      if (!name || number === undefined) {
        return NextResponse.json({ error: 'Name and number are required' }, { status: 400 });
      }

      const num = parseInt(String(number), 10);

      // Composite unique lookup [weddingId, number] — auto-injected by extension
      const existing = await tenantDb.table.findFirst({ where: { number: num } });
      if (existing) {
        return NextResponse.json({ error: 'A table with this number already exists' }, { status: 409 });
      }

      const table = await tenantDb.table.create({
        data: {
          weddingId: ctx.weddingId,
          name, number: num,
          capacity: capacity || 8,
          location: location || null,
        },
      });

      await writeAuditLog({
        weddingId: ctx.weddingId, userId: user.id,
        action: 'CREATE_TABLE',
        details: `Created table ${name} (#${number})`,
        request,
      });

      // P2-PERF-10: invalidate ISR caches for this resource + public pages.
      revalidatePath('/api/tables');
      revalidatePath('/w/[slug]', 'page');
      revalidatePath('/w/[slug]/invite/[code]', 'page');
      revalidatePath('/');

      return NextResponse.json({ table }, { status: 201 });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Create table error', {
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
      const { id, name, number, capacity, location } = body;
      if (!id) return NextResponse.json({ error: 'Table ID is required' }, { status: 400 });

      const existing = await tenantDb.table.findFirst({ where: { id } });
      if (!existing) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

      if (number !== undefined) {
        const num = parseInt(String(number), 10);
        const duplicate = await tenantDb.table.findFirst({
          where: { number: num, NOT: { id } },
        });
        if (duplicate) {
          return NextResponse.json({ error: 'A table with this number already exists' }, { status: 409 });
        }
      }

      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (number !== undefined) updateData.number = parseInt(String(number), 10);
      if (capacity !== undefined) updateData.capacity = capacity;
      if (location !== undefined) updateData.location = location;

      const table = await tenantDb.table.update({ where: { id }, data: updateData });

      await writeAuditLog({
        weddingId: ctx.weddingId, userId: user.id,
        action: 'UPDATE_TABLE',
        details: `Updated table ${existing.name}`,
        request,
      });

      // P2-PERF-10: invalidate ISR caches for this resource + public pages.
      revalidatePath('/api/tables');
      revalidatePath('/w/[slug]', 'page');
      revalidatePath('/w/[slug]/invite/[code]', 'page');
      revalidatePath('/');

      return NextResponse.json({ table });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Update table error', {
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
      if (!id) return NextResponse.json({ error: 'Table ID is required' }, { status: 400 });

      const existing = await tenantDb.table.findFirst({
        where: { id },
        include: { _count: { select: { guests: true } } },
      });
      if (!existing) return NextResponse.json({ error: 'Table not found' }, { status: 404 });

      if (existing._count.guests > 0) {
        return NextResponse.json(
          { error: 'Cannot delete table with assigned guests. Reassign guests first.' },
          { status: 400 }
        );
      }

      await tenantDb.table.delete({ where: { id } });

      await writeAuditLog({
        weddingId: ctx.weddingId, userId: user.id,
        action: 'DELETE_TABLE',
        details: `Deleted table ${existing.name}`,
        request,
      });

      // P2-PERF-10: invalidate ISR caches for this resource + public pages.
      revalidatePath('/api/tables');
      revalidatePath('/w/[slug]', 'page');
      revalidatePath('/w/[slug]/invite/[code]', 'page');
      revalidatePath('/');

      return NextResponse.json({ message: 'Table deleted successfully' });
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Delete table error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

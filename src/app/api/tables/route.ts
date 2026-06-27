export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db, tenantDb } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { withAdminTenantHandler } from '@/lib/tenant-context';

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
    console.error('List tables error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
      const body = await request.json();
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

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId, userId: user.id,
          action: 'CREATE_TABLE',
          details: `Created table ${name} (#${number})`,
        },
      });

      return NextResponse.json({ table }, { status: 201 });
    });
  } catch (error) {
    console.error('Create table error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
      const body = await request.json();
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

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId, userId: user.id,
          action: 'UPDATE_TABLE',
          details: `Updated table ${existing.name}`,
        },
      });

      return NextResponse.json({ table });
    });
  } catch (error) {
    console.error('Update table error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

      await db.auditLog.create({
        data: {
          weddingId: ctx.weddingId, userId: user.id,
          action: 'DELETE_TABLE',
          details: `Deleted table ${existing.name}`,
        },
      });

      return NextResponse.json({ message: 'Table deleted successfully' });
    });
  } catch (error) {
    console.error('Delete table error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

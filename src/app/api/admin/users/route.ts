export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, hashPassword } from '@/lib/auth';
import { resolveAdminTenant } from '@/lib/tenant-context';

// AdminUser is platform-level (not tenant-scoped) — SUPER_ADMIN has weddingId=null.
// However, non-SUPER_ADMIN users can only see users in their own wedding.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // SUPER_ADMIN sees all users; others see only users in their wedding
    const where = user.role === 'SUPER_ADMIN' ? {} : { weddingId: user.weddingId };

    const users = await db.adminUser.findMany({
      where,
      select: {
        id: true, email: true, name: true, role: true,
        weddingId: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('List users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Resolve tenant (for SUPER_ADMIN to assign new user to a specific wedding)
    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    const body = await request.json();
    const { email, password, name, role, weddingId } = body;

    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: 'Email, password, name, and role are required' }, { status: 400 });
    }

    const validRoles = ['SUPER_ADMIN', 'ORGANIZER', 'RECEPTION', 'CONTROLLER'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be one of: ' + validRoles.join(', ') }, { status: 400 });
    }

    const existing = await db.adminUser.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);

    // SUPER_ADMIN has no weddingId; other roles are scoped to the resolved wedding
    // (or to an explicitly-provided weddingId for SUPER_ADMIN creating users in other weddings)
    const assignedWeddingId = role === 'SUPER_ADMIN' ? null : (weddingId || context.weddingId);

    const newUser = await db.adminUser.create({
      data: {
        email: email.toLowerCase(),
        password: hashedPassword,
        name, role,
        weddingId: assignedWeddingId,
      },
      select: { id: true, email: true, name: true, role: true, weddingId: true, createdAt: true, updatedAt: true },
    });

    await db.auditLog.create({
      data: {
        weddingId: assignedWeddingId, // null for SUPER_ADMIN
        userId: user.id,
        action: 'CREATE_USER',
        details: `Created user ${email} (role: ${role})`,
      },
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { id, email, name, role, password, weddingId } = body;

    if (!id) return NextResponse.json({ error: 'User ID is required' }, { status: 400 });

    const existing = await db.adminUser.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (role) {
      const validRoles = ['SUPER_ADMIN', 'ORGANIZER', 'RECEPTION', 'CONTROLLER'];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (email) updateData.email = email.toLowerCase();
    if (name) updateData.name = name;
    if (role) {
      updateData.role = role;
      // SUPER_ADMIN must have null weddingId; non-SUPER_ADMIN retains existing or explicit weddingId
      if (role === 'SUPER_ADMIN') updateData.weddingId = null;
    }
    if (weddingId !== undefined) updateData.weddingId = weddingId;
    if (password) updateData.password = await hashPassword(password);

    const updatedUser = await db.adminUser.update({
      where: { id }, data: updateData,
      select: { id: true, email: true, name: true, role: true, weddingId: true, createdAt: true, updatedAt: true },
    });

    await db.auditLog.create({
      data: {
        weddingId: updatedUser.weddingId,
        userId: user.id,
        action: 'UPDATE_USER',
        details: `Updated user ${existing.email}`,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    if (id === user.id) return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });

    const existing = await db.adminUser.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await db.adminUser.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        weddingId: existing.weddingId,
        userId: user.id,
        action: 'DELETE_USER',
        details: `Deleted user ${existing.email}`,
      },
    });

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

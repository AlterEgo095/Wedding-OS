export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, hashPassword } from '@/lib/auth';
import { resolveAdminTenant } from '@/lib/tenant-context';
import { isPlatformAdmin } from '@/lib/types';
import { checkAdminLimit } from '@/lib/plan-limits';

// AdminUser is platform-level (not tenant-scoped) — SUPER_ADMIN has weddingId=null.
// However, non-SUPER_ADMIN users can only see users in their own wedding.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['ORGANIZER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Platform admins (PLATFORM_ADMIN or legacy SUPER_ADMIN) see all users;
    // other roles see only users in their own wedding.
    const where = isPlatformAdmin(user.role) ? {} : { weddingId: user.weddingId };

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

    // Platform admins (PLATFORM_ADMIN or legacy SUPER_ADMIN) have no weddingId;
    // other roles are scoped to the resolved wedding (or to an explicitly-
    // provided weddingId for platform admins creating users in other weddings).
    const assignedWeddingId = isPlatformAdmin(role) ? null : (weddingId || context.weddingId);

    // ─── Plan limit enforcement (Phase 3 ÉTAPE 5) ─────────────────────────
    // Only enforced for wedding-scoped roles (ORGANIZER/RECEPTION/CONTROLLER).
    // Platform admins are NOT counted against the limit. Existing users above
    // the limit remain visible + editable (zero regression).
    if (assignedWeddingId && !isPlatformAdmin(role)) {
      try {
        const limitCheck = await checkAdminLimit(assignedWeddingId);
        if (!limitCheck.allowed) {
          return NextResponse.json(
            {
              error: "Limite d'administrateurs atteinte pour votre plan",
              limit: limitCheck.limit,
              current: limitCheck.current,
              plan: limitCheck.plan,
              upgradeUrl: '/platform/admin',
            },
            { status: 403 }
          );
        }
      } catch (limitError) {
        // If the limit check itself fails, log and continue — we don't want
        // to block a legitimate write because of an internal accounting error.
        console.error('Admin limit check failed:', limitError);
      }
    }

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
      // Platform admins (PLATFORM_ADMIN or legacy SUPER_ADMIN) must have null weddingId;
      // other roles retain existing or explicit weddingId.
      if (isPlatformAdmin(role)) updateData.weddingId = null;
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

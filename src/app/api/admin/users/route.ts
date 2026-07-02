export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, hashPassword } from '@/lib/auth';
import { resolveAdminTenant } from '@/lib/tenant-context';
import { isPlatformAdmin } from '@/lib/types';
import { checkAdminLimit } from '@/lib/plan-limits';
// P2-CQ-1/2 + P2-SEC-2/3 + P1-SEC-6: shared constants from @/lib/constants.
import {
  VALID_ROLES,
  isValidPassword,
  PASSWORD_POLICY_MSG,
} from '@/lib/constants';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';
// P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
// P2-CQ-7: getClientInfo to resolve IP/UA for tx-scoped audit writes.
import { getClientInfo } from '@/lib/guest-auth';

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
    // P2-SEC-1: never log error.stack.
    logger.error('List users error', {
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
    if (!hasPermission(user.role, ['SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Resolve tenant (for SUPER_ADMIN to assign new user to a specific wedding)
    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    const body = await request.json().catch(() => null); // P2-CQ-6
    if (!body) {
      return NextResponse.json(
        { error: 'Corps de requête invalide' },
        { status: 400 }
      );
    }
    const { email, password, name, role, weddingId } = body;

    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: 'Email, password, name, and role are required' }, { status: 400 });
    }

    // SECURITY (P1-SEC-6): Enforce password policy on user creation.
    // P2-CQ-1: isValidPassword now imported from @/lib/constants.
    if (!isValidPassword(password)) {
      return NextResponse.json({ error: PASSWORD_POLICY_MSG }, { status: 400 });
    }

    // Phase 3 ÉTAPE 6: accept the canonical PLATFORM_ADMIN name AND the legacy
    // SUPER_ADMIN alias so the UI can use either without a 400. Both are
    // treated identically downstream (see isPlatformAdmin() in lib/types.ts).
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be one of: ' + VALID_ROLES.join(', ') }, { status: 400 });
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
        // P2-SEC-1: structured logger; no stack leak.
        logger.error('Admin limit check failed', {
          errMessage: limitError instanceof Error ? limitError.message : String(limitError),
          errName: limitError instanceof Error ? limitError.name : 'Unknown',
        });
      }
    }

    // P2-CQ-7: resolve IP/UA before the tx so the tx-scoped auditLog.create
    // can capture them in a single row (no second writeAuditLog needed).
    const client = getClientInfo(request);

    // P1-CQ-17: user create + audit log in a single tx — if the audit write
    // fails, the user creation rolls back too (no orphan user without an
    // audit trail).
    const newUser = await db.$transaction(async (tx) => {
      const created = await tx.adminUser.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name, role,
          weddingId: assignedWeddingId,
        },
        select: { id: true, email: true, name: true, role: true, weddingId: true, createdAt: true, updatedAt: true },
      });

      await tx.auditLog.create({
        data: {
          weddingId: assignedWeddingId, // null for SUPER_ADMIN
          userId: user.id,
          action: 'CREATE_USER',
          details: `Created user ${email} (role: ${role})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return created;
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error: unknown) {
    // P1-CQ-18: catch unique-constraint violations (email already exists).
    // The pre-flight findUnique above is a TOCTOU race window — two
    // concurrent POSTs with the same email can both pass the check and the
    // second create() throws P2002. Catch it and return 409 instead of 500.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Cet email est déjà utilisé' },
        { status: 409 }
      );
    }
    // P2-SEC-1: never log error.stack.
    logger.error('Create user error', {
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
    if (!hasPermission(user.role, ['SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => null); // P2-CQ-6
    if (!body) {
      return NextResponse.json(
        { error: 'Corps de requête invalide' },
        { status: 400 }
      );
    }
    const { id, email, name, role, password, weddingId } = body;

    if (!id) return NextResponse.json({ error: 'User ID is required' }, { status: 400 });

    const existing = await db.adminUser.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (role) {
      // Phase 3 ÉTAPE 6: accept both canonical PLATFORM_ADMIN and legacy SUPER_ADMIN.
      if (!VALID_ROLES.includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
    }

    // SECURITY (P1-SEC-6): Enforce password policy on password reset.
    // P2-CQ-1: isValidPassword now imported from @/lib/constants.
    if (password !== undefined && password !== null && !isValidPassword(password)) {
      return NextResponse.json({ error: PASSWORD_POLICY_MSG }, { status: 400 });
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

    // P2-CQ-7: resolve IP/UA before the tx.
    const client = getClientInfo(request);

    // P1-CQ-17: user update + audit log in a single tx.
    const updatedUser = await db.$transaction(async (tx) => {
      const updated = await tx.adminUser.update({
        where: { id }, data: updateData,
        select: { id: true, email: true, name: true, role: true, weddingId: true, createdAt: true, updatedAt: true },
      });

      await tx.auditLog.create({
        data: {
          weddingId: updated.weddingId,
          userId: user.id,
          action: 'UPDATE_USER',
          details: `Updated user ${existing.email}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return updated;
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error: any) {
    // P1-CQ-18: P2002 on update = email collision with another user.
    if (error?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Cet email est déjà utilisé' },
        { status: 409 }
      );
    }
    // P2-SEC-1: never log error.stack.
    logger.error('Update user error', {
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

    // P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
    await writeAuditLog({
      weddingId: existing.weddingId,
      userId: user.id,
      action: 'DELETE_USER',
      details: `Deleted user ${existing.email}`,
      request,
    });

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Delete user error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

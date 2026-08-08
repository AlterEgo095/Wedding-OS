export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { isPlatformAdmin } from '@/lib/types';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

// ══════════════════════════════════════════════════════════════════════════════
// PATCH /api/platform/users/{id}/suspend — Suspend or unsuspend a user
// ══════════════════════════════════════════════════════════════════════════════
// P5.1 H-DELEG-3 — Soft-suspend a per-wedding or platform admin user.
//
// Body: { suspended: boolean }
//
// When suspended=true:
//   - The user's next API request will be rejected (getAuthUser returns null)
//   - The AdminUser row is preserved (unlike DELETE)
//   - All audit history is preserved
//   - The user's active session is invalidated in real-time (1-request latency)
//
// When suspended=false:
//   - The user can log in and access the platform again
//   - suspendedAt and suspendedBy are cleared
//
// Guards:
//   - Cannot suspend self
//   - Cannot suspend the last active platform admin
//
// Audit log: SUSPEND_USER or UNSUSPEND_USER action with target user info.
// ══════════════════════════════════════════════════════════════════════════════

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    // ─── Fetch existing user ────────────────────────────────────────────────
    const existing = await db.adminUser.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, suspended: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.suspended !== 'boolean') {
      return NextResponse.json(
        { error: 'Body must include { suspended: boolean }' },
        { status: 400 }
      );
    }

    const newSuspended = body.suspended;

    // ─── Guard: cannot suspend self ──────────────────────────────────────────
    if (user!.id === id && newSuspended) {
      return NextResponse.json(
        { error: 'You cannot suspend your own account' },
        { status: 400 }
      );
    }

    // ─── Guard: cannot suspend last active platform admin ────────────────────
    if (newSuspended && isPlatformAdmin(existing.role)) {
      const activePlatformAdminCount = await db.adminUser.count({
        where: {
          OR: [{ role: 'PLATFORM_ADMIN' }, { role: 'SUPER_ADMIN' }],
          suspended: false,
        },
      });
      if (activePlatformAdminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot suspend the last active platform admin' },
          { status: 400 }
        );
      }
    }

    // ─── No-op if already in the desired state ──────────────────────────────
    if (existing.suspended === newSuspended) {
      return NextResponse.json({
        user: { id: existing.id, suspended: existing.suspended },
        message: `User is already ${newSuspended ? 'suspended' : 'active'}`,
      });
    }

    // ─── Persist ────────────────────────────────────────────────────────────
    const updated = await db.adminUser.update({
      where: { id },
      data: {
        suspended: newSuspended,
        suspendedAt: newSuspended ? new Date() : null,
        suspendedBy: newSuspended ? user!.id : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        suspended: true,
        suspendedAt: true,
        suspendedBy: true,
      },
    });

    // ─── Audit log ──────────────────────────────────────────────────────────
    await writeAuditLog({
      weddingId: null,
      userId: user!.id,
      action: newSuspended ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
      details: `${newSuspended ? 'Suspended' : 'Reactivated'} user ${existing.email} (${existing.role})`,
      request,
      targetUserId: existing.id,
      targetType: 'USER',
      result: 'SUCCESS',
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    logger.error('Suspend/unsuspend user error', { err: error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

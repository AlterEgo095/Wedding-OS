export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin, hashPassword } from '@/lib/auth';
import { normalizeRole, isPlatformAdmin, type Role } from '@/lib/types';
// P2-CQ-5: standardised API errors.
import { badRequest } from '@/lib/api-errors';
// P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';

/**
 * Per-user operations for the platform admin.
 *
 * PUT    /api/platform/users/{id}   — partial update (name/role/weddingId/password)
 * DELETE /api/platform/users/{id}   — delete user (with self-delete + last-admin guards)
 *
 * Platform-admin only. Uses RAW `db` (not `tenantDb`) because we are
 * operating ON users themselves, not on tenant-scoped child rows.
 *
 * Guards:
 *   - Cannot change own role          (PUT, when role differs from existing)
 *   - Cannot demote last platform admin (PUT, when demoting a PLATFORM_ADMIN)
 *   - Cannot delete self              (DELETE)
 *   - Cannot delete last platform admin (DELETE)
 *
 * Password hashes are NEVER returned in the response (USER_LIST_SELECT
 * excludes the `password` column).
 */

// Local copy of the select object — kept in sync with /api/platform/users/route.ts.
// We intentionally do NOT import across route files to keep each route
// self-contained (Next.js may tree-shake differently per route segment).
const USER_LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  weddingId: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  wedding: {
    select: { slug: true, coupleLabel: true },
  },
} as const;

const VALID_ROLES: string[] = [
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
  'ORGANIZER',
  'RECEPTION',
  'CONTROLLER',
];

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ─── PUT — Update an existing user (partial) ──────────────────────────────────
//
// Body (all optional):
//   { name?, role?, weddingId?, password? }
//
// Coupling rule (same as POST):
//   - PLATFORM_ADMIN  → weddingId must be null
//   - ORGANIZER/RECEPTION/CONTROLLER → weddingId must reference an existing wedding
//
// If `weddingId` is provided but `role` is NOT, we use the existing user's
// role to validate the coupling.
//
// Audit log records the list of changed field NAMES (never the password value).

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    // ─── Fetch existing user ────────────────────────────────────────────────
    const existing = await db.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        weddingId: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null); // P2-CQ-6
    if (!body) return badRequest('Corps de requête invalide');
    const { name, role, weddingId, password } = body;

    // ─── Validate provided fields ───────────────────────────────────────────
    let trimmedName: string | undefined;
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
        return NextResponse.json(
          { error: 'Name must be 1–100 characters' },
          { status: 400 }
        );
      }
      trimmedName = name.trim();
    }

    let normalizedRole: Role | undefined;
    if (role !== undefined) {
      if (typeof role !== 'string' || !VALID_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `Role must be one of: ${VALID_ROLES.join(', ')}` },
          { status: 400 }
        );
      }
      normalizedRole = normalizeRole(role);
    }

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 }
        );
      }
    }

    // ─── Guard: cannot change own role ──────────────────────────────────────
    if (
      user!.id === id &&
      normalizedRole !== undefined &&
      normalizedRole !== existing.role
    ) {
      return NextResponse.json(
        { error: 'You cannot change your own role' },
        { status: 400 }
      );
    }

    // ─── Guard: cannot demote last platform admin ───────────────────────────
    const wasPlatformAdmin = isPlatformAdmin(existing.role);
    const willBePlatformAdmin = normalizedRole !== undefined
      ? isPlatformAdmin(normalizedRole)
      : wasPlatformAdmin;

    if (wasPlatformAdmin && !willBePlatformAdmin) {
      const platformAdminCount = await db.adminUser.count({
        where: {
          OR: [{ role: 'PLATFORM_ADMIN' }, { role: 'SUPER_ADMIN' }],
        },
      });
      if (platformAdminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot demote the last platform admin' },
          { status: 400 }
        );
      }
    }

    // ─── Role ↔ weddingId coupling ──────────────────────────────────────────
    let finalWeddingId: string | null | undefined;
    if (weddingId !== undefined) {
      // Resolve the role we should validate against: new role if provided,
      // otherwise the existing user's role.
      const effectiveRole: Role = normalizedRole ?? normalizeRole(existing.role);

      if (isPlatformAdmin(effectiveRole)) {
        if (weddingId !== null && weddingId !== '') {
          return NextResponse.json(
            { error: 'Platform admins cannot be assigned to a wedding' },
            { status: 400 }
          );
        }
        finalWeddingId = null;
      } else {
        if (typeof weddingId !== 'string' || !weddingId.trim()) {
          return NextResponse.json(
            { error: 'weddingId is required for non-platform roles' },
            { status: 400 }
          );
        }
        const wedding = await db.wedding.findUnique({
          where: { id: weddingId.trim() },
          select: { id: true },
        });
        if (!wedding) {
          return NextResponse.json(
            { error: 'Referenced wedding does not exist' },
            { status: 400 }
          );
        }
        finalWeddingId = wedding.id;
      }
    }

    // ─── Build update payload ───────────────────────────────────────────────
    const updateData: Record<string, unknown> = {};

    if (trimmedName !== undefined) updateData.name = trimmedName;
    if (normalizedRole !== undefined) updateData.role = normalizedRole;
    if (finalWeddingId !== undefined) updateData.weddingId = finalWeddingId;
    if (password !== undefined) {
      updateData.password = await hashPassword(password);
    }

    // ─── Persist ────────────────────────────────────────────────────────────
    const updated = await db.adminUser.update({
      where: { id },
      data: updateData,
      select: USER_LIST_SELECT,
    });

    // ─── Audit log ──────────────────────────────────────────────────────────
    // Never include the password VALUE — only the field name "password".
    // P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
    await writeAuditLog({
      weddingId: null, // platform-level event
      userId: user!.id,
      action: 'UPDATE_USER',
      details: `Updated user ${existing.email} (fields: ${Object.keys(updateData).join(', ')})`,
      request,
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error('Update platform user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── DELETE — Remove a user ───────────────────────────────────────────────────
//
// Guards:
//   - Cannot delete self
//   - Cannot delete the last platform admin

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    // ─── Fetch existing user ────────────────────────────────────────────────
    const existing = await db.adminUser.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // ─── Guard: cannot delete self ──────────────────────────────────────────
    if (user!.id === id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 400 }
      );
    }

    // ─── Guard: cannot delete last platform admin ───────────────────────────
    if (isPlatformAdmin(existing.role)) {
      const platformAdminCount = await db.adminUser.count({
        where: {
          OR: [{ role: 'PLATFORM_ADMIN' }, { role: 'SUPER_ADMIN' }],
        },
      });
      if (platformAdminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot delete the last platform admin' },
          { status: 400 }
        );
      }
    }

    // ─── Delete ─────────────────────────────────────────────────────────────
    await db.adminUser.delete({ where: { id } });

    // ─── Audit log ──────────────────────────────────────────────────────────
    // P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
    await writeAuditLog({
      weddingId: null, // platform-level event
      userId: user!.id,
      action: 'DELETE_USER',
      details: `Deleted user ${existing.email} (${existing.role})`,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete platform user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin, hashPassword } from '@/lib/auth';
import { normalizeRole, type Role } from '@/lib/types';
// P2-CQ-1/2 + P2-SEC-2/3: shared constants from @/lib/constants.
import { EMAIL_REGEX, VALID_ROLES, isValidPassword, PASSWORD_POLICY_MSG } from '@/lib/constants';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';
// P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
// P2-CQ-7: getClientInfo to resolve IP/UA for tx-scoped audit writes.
import { getClientInfo } from '@/lib/guest-auth';

/**
 * Platform-wide user management.
 *
 * GET  /api/platform/users?page=1&limit=20&search=&role=&weddingId=
 *   → { users, total, page, limit }
 *
 * POST /api/platform/users
 *   → 201 { user }   (creates a new AdminUser across any wedding)
 *
 * Returns AdminUser records across ALL weddings. Each user includes the
 * `wedding` relation (slug + coupleLabel) when `weddingId` is set, so the
 * platform UI can show which tenant each staff member belongs to.
 *
 * Password hashes are NEVER selected — the API response excludes them
 * explicitly via the `select` clause.
 */

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

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const role = searchParams.get('role')?.trim() || '';
    const weddingId = searchParams.get('weddingId')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (weddingId) where.weddingId = weddingId;
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { name: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      db.adminUser.findMany({
        where,
        select: USER_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.adminUser.count({ where }),
    ]);

    return NextResponse.json({
      users,
      total,
      page,
      limit,
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('List platform users error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── POST — Create a new platform user ─────────────────────────────────────────
//
// Body:
//   { name, email, password, role, weddingId? }
//
// Role must be one of: PLATFORM_ADMIN | SUPER_ADMIN | ORGANIZER | RECEPTION | CONTROLLER
// (SUPER_ADMIN is normalized to PLATFORM_ADMIN).
//
// Coupling rule:
//   - PLATFORM_ADMIN  → weddingId MUST be null/omitted
//   - ORGANIZER/RECEPTION/CONTROLLER → weddingId is REQUIRED and must reference
//     an existing wedding
//
// Email must be unique across the platform. Passwords are hashed with bcrypt
// (rounds 12) and NEVER included in the response.

// P1-SEC-5 + P2-SEC-3: VALID_CREATE_ROLES now imported from @/lib/constants
// (was duplicated locally). The shared VALID_ROLES is a readonly tuple; we
// cast to string[] here for the .includes() check (callers can't tell the
// difference — runtime semantics are identical).
const VALID_CREATE_ROLES: readonly string[] = VALID_ROLES;

// P2-CQ-1 + P2-SEC-2: EMAIL_REGEX now imported from @/lib/constants.

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => null); // P2-CQ-6
    if (!body) {
      return NextResponse.json(
        { error: 'Corps de requête invalide' },
        { status: 400 }
      );
    }
    const { name, email, password, role, weddingId } = body;

    // ─── Field validation ───────────────────────────────────────────────────
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
      return NextResponse.json(
        { error: 'Name is required and must be 1–100 characters' },
        { status: 400 }
      );
    }
    const trimmedName = name.trim();

    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim().toLowerCase())) {
      return NextResponse.json(
        { error: 'A valid email is required' },
        { status: 400 }
      );
    }
    const normalizedEmail = email.trim().toLowerCase();

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }
    // P1-SEC-5: enforce full password policy (min 8 chars + letter + digit).
    // Same pattern as /api/admin/users (P1-SEC-6).
    if (!isValidPassword(password)) {
      return NextResponse.json(
        { error: PASSWORD_POLICY_MSG },
        { status: 400 }
      );
    }

    if (typeof role !== 'string' || !VALID_CREATE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${VALID_CREATE_ROLES.join(', ')}` },
        { status: 400 }
      );
    }
    const normalizedRole: Role = normalizeRole(role);

    // ─── Role ↔ weddingId coupling ──────────────────────────────────────────
    let finalWeddingId: string | null = null;
    if (isPlatformAdminRole(normalizedRole)) {
      if (weddingId !== undefined && weddingId !== null && weddingId !== '') {
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

    // ─── Email uniqueness ───────────────────────────────────────────────────
    const existing = await db.adminUser.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Email already in use' },
        { status: 409 }
      );
    }

    // ─── Hash password + persist (P1-CQ-17: user + auditLog in tx) ───────
    const hashedPassword = await hashPassword(password);

    // P2-CQ-7: resolve IP/UA before the tx so the tx-scoped auditLog.create
    // can capture them in a single row.
    const client = getClientInfo(request);

    const created = await db.$transaction(async (tx) => {
      const userRow = await tx.adminUser.create({
        data: {
          name: trimmedName,
          email: normalizedEmail,
          password: hashedPassword,
          role: normalizedRole,
          weddingId: finalWeddingId,
        },
        select: USER_LIST_SELECT,
      });

      await tx.auditLog.create({
        data: {
          weddingId: null, // platform-level event
          userId: user!.id,
          action: 'CREATE_USER',
          details: `Created user ${normalizedEmail} (${normalizedRole})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return userRow;
    });

    return NextResponse.json({ user: created }, { status: 201 });
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
    logger.error('Create platform user error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// Small helper so we don't pull `isPlatformAdmin` (which operates on raw DB
// strings including the legacy SUPER_ADMIN alias) when we already hold a
// normalized Role. Avoids subtle double-normalization bugs.
function isPlatformAdminRole(role: Role): boolean {
  return role === 'PLATFORM_ADMIN';
}

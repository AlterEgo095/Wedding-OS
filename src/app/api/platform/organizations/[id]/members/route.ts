export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { getClientInfo } from '@/lib/guest-auth';
import { checkOrgMemberLimit } from '@/lib/org-quotas'; // P2.8

/**
 * Mission 6.0 P1.6 — Organization members management.
 *
 * GET  /api/platform/organizations/{id}/members?status=&role=
 *   → { members, total }
 *
 * POST /api/platform/organizations/{id}/members
 *   body: { email, role: ORG_ADMIN|ORG_MEMBER|ORG_VIEWER }
 *   → 201 { member }
 *
 * Platform-admin only. If the user (by email) exists in AdminUser, an
 * OrganizationMember row is created directly with status=ACTIVE (no email
 * invite needed). If the user does NOT exist, we return 404 with a helpful
 * message — P1.9 will add the full email-invite flow (create pending user +
 * send invite email).
 *
 * Org-member role is independent from AdminUser.role — the AdminUser.role is
 * the user's primary platform role (e.g. ORG_ADMIN if this is their main
 * org, or PLATFORM_ADMIN for cross-tenant admins). The OrganizationMember.role
 * is the user's role WITHIN this specific organization.
 */

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const inviteMemberSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(['ORG_ADMIN', 'ORG_MEMBER', 'ORG_VIEWER']),
});

// ─── GET — list members ───────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rlKey = getRateLimitKey(request);
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(rlKey, 30, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds ?? 60) } }
      );
    }

    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return badRequest("Identifiant d'organisation requis");

    // Verify org exists (so we don't return an empty list for a wrong id).
    const org = await db.organization.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!org) return notFound("Organisation introuvable");

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status')?.trim() || '';
    const role = searchParams.get('role')?.trim() || '';

    const where: Record<string, unknown> = { organizationId: id };
    if (status) where.status = status;
    if (role) where.role = role;

    const [members, total] = await Promise.all([
      db.organizationMember.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              lastLoginAt: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ status: 'asc' }, { joinedAt: 'desc' }],
      }),
      db.organizationMember.count({ where }),
    ]);

    return NextResponse.json({ members, total });
  } catch (error) {
    logger.error('List organization members error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── POST — add/invite a member ───────────────────────────────────────────────
//
// Decision (P1.6): if the email matches an existing AdminUser, create the
// OrganizationMember directly with status=ACTIVE + joinedAt=now. If not,
// return 404 — P1.9 will add the full email-invite flow (create pending
// AdminUser + send invite email + accept-token route).

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rlKey = getRateLimitKey(request);
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(rlKey, 10, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds ?? 60) } }
      );
    }

    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return badRequest("Identifiant d'organisation requis");

    const org = await db.organization.findUnique({
      where: { id },
      select: { id: true, slug: true, status: true },
    });
    if (!org) return notFound("Organisation introuvable");
    if (org.status === 'ARCHIVED') {
      return NextResponse.json(
        { error: "Impossible d'ajouter un membre à une organisation archivée" },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = inviteMemberSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;
    const normalizedEmail = data.email.trim().toLowerCase();

    // ─── Resolve the user by email ─────────────────────────────────────────────
    const targetUser = await db.adminUser.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!targetUser) {
      // P1.9 will add the invite-by-email flow. For now, return a helpful 404.
      return NextResponse.json(
        {
          error:
            "Aucun utilisateur trouvé avec cet email. L'utilisateur doit d'abord créer un compte.",
          email: normalizedEmail,
        },
        { status: 404 }
      );
    }

    const existingMembership = await db.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: id, userId: targetUser.id },
      },
      select: { id: true, status: true },
    });

    // If they're already an ACTIVE member → conflict.
    if (existingMembership?.status === 'ACTIVE') {
      return NextResponse.json(
        { error: 'Cet utilisateur est déjà membre actif de cette organisation' },
        { status: 409 }
      );
    }

    // ─── P2.8: Enforce org member quota via the shared helper ─────────────────
    // The helper counts ACTIVE + PENDING members against `maxMembers`.
    // Reactivation of a REVOKED member does NOT count as a new addition
    // (they're already in the member table), so we only enforce for genuinely
    // new memberships.
    if (!existingMembership) {
      const quota = await checkOrgMemberLimit(id);
      if (!quota.allowed) {
        return NextResponse.json(
          {
            error: `Quota dépassé: ${quota.current}/${quota.limit} membres pour cette organisation`,
            quota: 'members',
            current: quota.current,
            limit: quota.limit,
          },
          { status: 402 }
        );
      }
    }

    const client = getClientInfo(request);

    const member = await db.$transaction(async (tx) => {
      let row;
      if (existingMembership) {
        // Reactivate a previously-revoked membership (preserve role if
        // unchanged, otherwise update to the new role).
        row = await tx.organizationMember.update({
          where: { id: existingMembership.id },
          data: {
            role: data.role,
            status: 'ACTIVE',
            joinedAt: new Date(),
            invitedBy: user!.id,
            invitedAt: new Date(),
          },
          include: {
            user: {
              select: { id: true, email: true, name: true, role: true },
            },
          },
        });
      } else {
        row = await tx.organizationMember.create({
          data: {
            organizationId: id,
            userId: targetUser.id,
            role: data.role,
            status: 'ACTIVE',
            invitedBy: user!.id,
            invitedAt: new Date(),
            joinedAt: new Date(),
          },
          include: {
            user: {
              select: { id: true, email: true, name: true, role: true },
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'ADD_ORG_MEMBER',
          details: `Added member ${targetUser.email} (${data.role}) to organization ${org.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return row;
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error: unknown) {
    // P2002 — (organizationId, userId) unique violation. Race: two concurrent
    // POSTs adding the same user. Return a clean 409.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Cet utilisateur est déjà membre de cette organisation' },
        { status: 409 }
      );
    }
    logger.error('Add organization member error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

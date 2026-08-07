export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { isOrgRole, isPlatformAdmin } from '@/lib/types';
import { logger } from '@/lib/logger';
import { internalError, badRequest, notFound, forbidden, unauthorized } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { getClientInfo } from '@/lib/guest-auth';
import { checkOrgMemberLimit } from '@/lib/org-quotas'; // P2.8

/**
 * Mission 6.0 P1.8 — Org-scoped members management.
 *
 * GET  /api/org/{slug}/members?status=&role=
 *   → 200 { members, total }
 *
 * POST /api/org/{slug}/members
 *   body: { email, role: ORG_ADMIN|ORG_MEMBER|ORG_VIEWER }
 *   → 201 { member }
 *
 * Auth: caller must be
 *   (a) a platform admin (cross-tenant), OR
 *   (b) an ORG_ADMIN or ORG_MEMBER of THIS org.
 *   (ORG_VIEWER → 403 on POST; GET allowed for read-only dashboard.)
 *
 * Mirrors the platform-admin /api/platform/organizations/[id]/members route
 * but resolved by slug + scoped to the caller's own org.
 */

const inviteMemberSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(['ORG_ADMIN', 'ORG_MEMBER', 'ORG_VIEWER']),
});

/** Resolve org by slug + verify caller membership. Returns {org, user} or null. */
async function resolveOrgAndUser(request: NextRequest, slug: string, requireWrite: boolean) {
  const user = await getAuthUser(request);
  if (!user) return { error: unauthorized() };

  // Platform admin bypasses org membership.
  if (isPlatformAdmin(user.role)) {
    const org = await db.organization.findUnique({
      where: { slug },
      select: { id: true, slug: true, status: true, name: true },
    });
    if (!org) return { error: notFound('Organisation introuvable') };
    return { org, user };
  }

  // Org-scoped users must belong to this exact org.
  if (!isOrgRole(user.role)) {
    return { error: forbidden() };
  }

  const org = await db.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, status: true, name: true },
  });
  if (!org) return { error: notFound('Organisation introuvable') };

  if (user.organizationId !== org.id) {
    return { error: forbidden() };
  }

  // Write operations require ORG_ADMIN or ORG_MEMBER.
  if (requireWrite && user.role === 'ORG_VIEWER') {
    return { error: forbidden('Accès insuffisant : ORG_ADMIN ou ORG_MEMBER requis') };
  }

  return { org, user };
}

// ─── GET — list members ───────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
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

    const { slug } = await params;
    if (!slug) return badRequest('Slug requis');

    const ctx = await resolveOrgAndUser(request, slug, false);
    if ('error' in ctx) return ctx.error;
    const { org } = ctx;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status')?.trim() || '';
    const role = searchParams.get('role')?.trim() || '';

    const where: Record<string, unknown> = { organizationId: org.id };
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
    logger.error('List org members (slug) error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── POST — invite / add a member ─────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
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

    const { slug } = await params;
    if (!slug) return badRequest('Slug requis');

    const ctx = await resolveOrgAndUser(request, slug, true);
    if ('error' in ctx) return ctx.error;
    const { org, user } = ctx;

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

    // ─── Resolve the user by email ─────────────────────────────────────────
    const targetUser = await db.adminUser.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!targetUser) {
      // P1.9 will add the email-invite flow. For now, return a helpful 404.
      return NextResponse.json(
        {
          error:
            "Aucun utilisateur trouvé avec cet email. L'utilisateur doit d'abord créer un compte.",
          email: normalizedEmail,
        },
        { status: 404 }
      );
    }

    // ─── P2.8: Enforce org member quota via the shared helper ─────────────
    // The helper counts ACTIVE + PENDING members against `maxMembers`.
    // Reactivation of a REVOKED member does NOT count as a new addition
    // (they're already in the member table), so we only enforce for genuinely
    // new memberships.
    const existingMembership = await db.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: org.id, userId: targetUser.id },
      },
      select: { id: true, status: true },
    });

    if (existingMembership?.status === 'ACTIVE') {
      return NextResponse.json(
        { error: 'Cet utilisateur est déjà membre actif de cette organisation' },
        { status: 409 }
      );
    }

    if (!existingMembership) {
      const quota = await checkOrgMemberLimit(org.id);
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
        // Reactivate a previously-revoked membership.
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
            user: { select: { id: true, email: true, name: true, role: true } },
          },
        });
      } else {
        row = await tx.organizationMember.create({
          data: {
            organizationId: org.id,
            userId: targetUser.id,
            role: data.role,
            status: 'ACTIVE',
            invitedBy: user!.id,
            invitedAt: new Date(),
            joinedAt: new Date(),
          },
          include: {
            user: { select: { id: true, email: true, name: true, role: true } },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'INVITE_ORG_MEMBER',
          details: `Invited ${targetUser.email} as ${data.role} to organization ${org.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return row;
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error: unknown) {
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
    logger.error('Create org member (slug) error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

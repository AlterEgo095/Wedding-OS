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

/**
 * Mission 6.0 P1.8 — Update / revoke a single org membership (org-scoped).
 *
 * PATCH  /api/org/{slug}/members/{memberId}
 *   body: { role?, status? }
 *   → 200 { member }
 *
 * DELETE /api/org/{slug}/members/{memberId}
 *   → 200 { member }   (soft-revoke: status = REVOKED)
 *
 * Auth: ORG_ADMIN of this org OR platform admin. ORG_MEMBER/ORG_VIEWER → 403.
 *
 * Mirrors the platform-admin /api/platform/organizations/[id]/members/[memberId]
 * route but scoped to the caller's own org.
 */

const updateMemberSchema = z
  .object({
    role: z.enum(['ORG_ADMIN', 'ORG_MEMBER', 'ORG_VIEWER']).optional(),
    status: z.enum(['ACTIVE', 'REVOKED']).optional(),
  })
  .strict()
  .refine((data) => data.role !== undefined || data.status !== undefined, {
    message: "Aucun champ à mettre à jour (role ou status requis)",
  });

/** Resolve org + caller, requiring write (ORG_ADMIN or platform admin). */
async function resolveForWrite(request: NextRequest, slug: string) {
  const user = await getAuthUser(request);
  if (!user) return { error: unauthorized() };

  if (isPlatformAdmin(user.role)) {
    const org = await db.organization.findUnique({
      where: { slug },
      select: { id: true, slug: true, maxMembers: true },
    });
    if (!org) return { error: notFound('Organisation introuvable') };
    return { org, user };
  }

  if (!isOrgRole(user.role)) return { error: forbidden() };

  const org = await db.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, maxMembers: true },
  });
  if (!org) return { error: notFound('Organisation introuvable') };

  if (user.organizationId !== org.id) return { error: forbidden() };

  // Write operations require ORG_ADMIN.
  if (user.role !== 'ORG_ADMIN') {
    return { error: forbidden('Accès insuffisant : ORG_ADMIN requis') };
  }

  return { org, user };
}

async function findMember(organizationId: string, memberId: string) {
  return db.organizationMember.findFirst({
    where: { id: memberId, organizationId },
    include: {
      user: { select: { id: true, email: true, name: true, role: true } },
      organization: { select: { id: true, slug: true } },
    },
  });
}

// ─── PATCH — update role or status ────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; memberId: string }> }
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

    const { slug, memberId } = await params;
    if (!slug || !memberId) return badRequest('Identifiants requis');

    const ctx = await resolveForWrite(request, slug);
    if ('error' in ctx) return ctx.error;
    const { org, user } = ctx;

    const existing = await findMember(org.id, memberId);
    if (!existing) return notFound('Membre introuvable dans cette organisation');

    // Self-demotion guard: an ORG_ADMIN may not revoke their own ADMIN role
    // (otherwise they could lock themselves out of the org admin UI).
    if (existing.userId === user!.id && existing.role === 'ORG_ADMIN') {
      const body = await request.json().catch(() => null);
      const newRole = body?.role;
      const newStatus = body?.status;
      if (newRole !== 'ORG_ADMIN' || newStatus === 'REVOKED') {
        return NextResponse.json(
          { error: "Vous ne pouvez pas révoquer ou rétrograder votre propre rôle d'administrateur" },
          { status: 409 }
        );
      }
    }

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = updateMemberSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // ─── Enforce maxMembers cap when (re)activating ──────────────────────────
    if (data.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      const activeCount = await db.organizationMember.count({
        where: { organizationId: org.id, status: 'ACTIVE' },
      });
      if (activeCount >= org.maxMembers) {
        return NextResponse.json(
          {
            error: `Limite de membres atteinte (${org.maxMembers}). Augmentez le quota avant de réactiver ce membre.`,
          },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.role) updateData.role = data.role;
    if (data.status) {
      updateData.status = data.status;
      if (data.status === 'ACTIVE' && !existing.joinedAt) {
        updateData.joinedAt = new Date();
      }
    }

    const client = getClientInfo(request);

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.organizationMember.update({
        where: { id: memberId },
        data: updateData,
        include: {
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      });

      const changes = Object.keys(updateData).join(', ');
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_ORG_MEMBER',
          details: `Updated member ${existing.user.email} in organization ${org.slug}: ${changes}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return row;
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    logger.error('Update org member (slug) error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── DELETE — revoke membership (soft delete) ─────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; memberId: string }> }
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

    const { slug, memberId } = await params;
    if (!slug || !memberId) return badRequest('Identifiants requis');

    const ctx = await resolveForWrite(request, slug);
    if ('error' in ctx) return ctx.error;
    const { org, user } = ctx;

    const existing = await findMember(org.id, memberId);
    if (!existing) return notFound('Membre introuvable dans cette organisation');

    if (existing.status === 'REVOKED') {
      return NextResponse.json(
        { error: 'Ce membre est déjà révoqué' },
        { status: 409 }
      );
    }

    // Self-revocation guard.
    if (existing.userId === user!.id) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas révoquer votre propre accès à l'organisation" },
        { status: 409 }
      );
    }

    const client = getClientInfo(request);

    const revoked = await db.$transaction(async (tx) => {
      const row = await tx.organizationMember.update({
        where: { id: memberId },
        data: { status: 'REVOKED' },
        include: {
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'REVOKE_ORG_MEMBER',
          details: `Revoked member ${existing.user.email} from organization ${org.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return row;
    });

    return NextResponse.json({ member: revoked });
  } catch (error) {
    logger.error('Revoke org member (slug) error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

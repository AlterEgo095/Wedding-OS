export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * Mission 6.0 P1.6 — Update / revoke a single organization membership.
 *
 * PATCH  /api/platform/organizations/{id}/members/{memberId}
 *   body: { role?, status? }
 *   → 200 { member }
 *
 * DELETE /api/platform/organizations/{id}/members/{memberId}
 *   → 200 { member }   (soft-revoke: status = REVOKED, not hard delete)
 *
 * Platform-admin only. We never hard-delete OrganizationMember rows — audit
 * history + financial reconciliation require keeping the join row. Revoking
 * sets status=REVOKED; re-inviting via POST /members reactivates the row.
 */

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const updateMemberSchema = z
  .object({
    role: z.enum(['ORG_ADMIN', 'ORG_MEMBER', 'ORG_VIEWER']).optional(),
    status: z.enum(['ACTIVE', 'REVOKED']).optional(),
  })
  .strict()
  .refine((data) => data.role !== undefined || data.status !== undefined, {
    message: "Aucun champ à mettre à jour (role ou status requis)",
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  { params }: { params: Promise<{ id: string; memberId: string }> }
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

    const { id, memberId } = await params;
    if (!id || !memberId) return badRequest("Identifiants requis");

    const existing = await findMember(id, memberId);
    if (!existing) return notFound("Membre introuvable dans cette organisation");

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = updateMemberSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // ─── Enforce maxMembers cap when (re)activating ────────────────────────────
    if (data.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      const org = await db.organization.findUnique({
        where: { id },
        select: { maxMembers: true },
      });
      if (org) {
        const activeCount = await db.organizationMember.count({
          where: { organizationId: id, status: 'ACTIVE' },
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
    }

    // ─── Build the update payload (only send defined fields) ──────────────────
    const updateData: Record<string, unknown> = {};
    if (data.role) updateData.role = data.role;
    if (data.status) {
      updateData.status = data.status;
      // Set joinedAt when activating for the first time / reactivating.
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
          details: `Updated member ${existing.user.email} in organization ${existing.organization.slug}: ${changes}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return row;
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    logger.error('Update organization member error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── DELETE — revoke membership (soft delete) ─────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
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

    const { id, memberId } = await params;
    if (!id || !memberId) return badRequest("Identifiants requis");

    const existing = await findMember(id, memberId);
    if (!existing) return notFound("Membre introuvable dans cette organisation");

    if (existing.status === 'REVOKED') {
      return NextResponse.json(
        { error: "Ce membre est déjà révoqué" },
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
          details: `Revoked member ${existing.user.email} from organization ${existing.organization.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return row;
    });

    return NextResponse.json({ member: revoked });
  } catch (error) {
    logger.error('Revoke organization member error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { getClientInfo } from '@/lib/guest-auth';
import { updateOrgQuotas } from '@/lib/org-quotas'; // P2.8

/**
 * Mission 6.0 P1.6 — Update organization limits (quotas).
 *
 * PATCH /api/platform/organizations/{id}/limits
 *   body: { maxWeddings?, maxMembers?, maxInvitationsPerMonth? }
 *   → 200 { organization, warnings? }
 *
 * P2.8 — added maxInvitationsPerMonth (org-level monthly invitation quota).
 * Quota values use -1 = unlimited, 0 = blocked. Defaults: 1/5/50.
 *
 * Dedicated endpoint for the quota fields — these change less often than
 * profile fields (name/email/etc.) and are typically edited in a separate
 * "Plan & Limits" panel. Splitting them out also allows finer-grained
 * audit logging + future RBAC (e.g. only PLATFORM_ADMIN can change quotas
 * while ORG_ADMIN can edit profile).
 *
 * Lowering a limit below the current active count is allowed (the platform
 * does NOT auto-revoke existing weddings/members) but the response includes
 * `warning` fields so the UI can prompt for confirmation.
 *
 * Platform-admin only.
 */

// ─── Zod schema ───────────────────────────────────────────────────────────────

const updateLimitsSchema = z
  .object({
    // P2.8 — accept -1 (unlimited) → 1_000_000. Validation delegated to
    // updateOrgQuotas() which throws on < -1.
    maxWeddings: z.number().int().min(-1).max(1_000_000).optional(),
    maxMembers: z.number().int().min(-1).max(1_000_000).optional(),
    maxInvitationsPerMonth: z.number().int().min(-1).max(1_000_000).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.maxWeddings !== undefined ||
      data.maxMembers !== undefined ||
      data.maxInvitationsPerMonth !== undefined,
    {
      message:
        "Aucun champ à mettre à jour (maxWeddings, maxMembers ou maxInvitationsPerMonth requis)",
    }
  );

export async function PATCH(
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

    const existing = await db.organization.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        name: true,
        maxWeddings: true,
        maxMembers: true,
        maxInvitationsPerMonth: true,
        status: true,
      },
    });
    if (!existing) return notFound("Organisation introuvable");

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = updateLimitsSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // ─── P2.8: Route the actual update through updateOrgQuotas ────────────────
    // The helper validates (>= -1) + applies the update + logs. We then
    // compute warnings + audit log in the tx below.
    const quotaUpdate: {
      maxWeddings?: number;
      maxMembers?: number;
      maxInvitationsPerMonth?: number;
    } = {};
    if (data.maxWeddings !== undefined) quotaUpdate.maxWeddings = data.maxWeddings;
    if (data.maxMembers !== undefined) quotaUpdate.maxMembers = data.maxMembers;
    if (data.maxInvitationsPerMonth !== undefined)
      quotaUpdate.maxInvitationsPerMonth = data.maxInvitationsPerMonth;

    try {
      await updateOrgQuotas(id, quotaUpdate);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Quota invalide';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // ─── Compute warnings if new limits are below current active counts ──────
    const warnings: string[] = [];
    if (data.maxWeddings !== undefined && data.maxWeddings < existing.maxWeddings) {
      const currentWeddings = await db.wedding.count({
        where: { organizationId: id, status: { notIn: ['ARCHIVED'] } },
      });
      if (currentWeddings > data.maxWeddings) {
        warnings.push(
          `Le nouveau plafond (${data.maxWeddings}) est inférieur au nombre de mariages actifs (${currentWeddings}). Les mariages existants ne sont pas supprimés.`
        );
      }
    }
    if (data.maxMembers !== undefined && data.maxMembers < existing.maxMembers) {
      const currentMembers = await db.organizationMember.count({
        where: { organizationId: id, status: 'ACTIVE' },
      });
      if (currentMembers > data.maxMembers) {
        warnings.push(
          `Le nouveau plafond (${data.maxMembers}) est inférieur au nombre de membres actifs (${currentMembers}). Les membres existants ne sont pas révoqués.`
        );
      }
    }

    const client = getClientInfo(request);

    const updated = await db.$transaction(async (tx) => {
      // P2.8 — re-read after updateOrgQuotas so the response reflects the new
      // values (the helper wrote via db.organization.update outside this tx).
      const org = await tx.organization.findUnique({
        where: { id },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          plan: true,
          maxWeddings: true,
          maxMembers: true,
          maxInvitationsPerMonth: true,
        },
      });

      const changes = Object.keys(quotaUpdate).join(', ');
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_ORG_LIMITS',
          details: `Updated limits for organization ${org?.slug}: ${changes}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return org;
    });

    return NextResponse.json({
      organization: updated,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error) {
    logger.error('Update organization limits error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

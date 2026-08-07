export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { getClientInfo } from '@/lib/guest-auth';
import { invalidateOrgThemeCache } from '@/lib/wedding/theme-injector'; // P1.10
import { updateOrgQuotas } from '@/lib/org-quotas'; // P2.8

/**
 * Mission 6.0 P1.6 — Single-organization management.
 *
 * GET    /api/platform/organizations/{id}           → details + members + recent weddings
 * PATCH  /api/platform/organizations/{id}           → update mutable fields
 * DELETE /api/platform/organizations/{id}           → soft-delete (status = ARCHIVED)
 *
 * Platform-admin only. Uses raw `db` (cross-tenant).
 */

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const updateOrgSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    email: z.string().email().max(200).optional(),
    phone: z.string().max(40).optional().nullable(),
    logoUrl: z.string().max(1000).optional().nullable(),
    brandColor: z
      .string()
      .max(20)
      .regex(/^#[0-9a-fA-F]{3,8}$|^$/)
      .optional()
      .nullable(),
    customDomain: z.string().max(255).optional().nullable(),
    plan: z.enum(['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE']).optional(),
    // P2.8 — quota fields accept -1 (unlimited) → 1_000_000.
    // These are routed through updateOrgQuotas() below for validation.
    maxWeddings: z.number().int().min(-1).max(1_000_000).optional(),
    maxMembers: z.number().int().min(-1).max(1_000_000).optional(),
    maxInvitationsPerMonth: z.number().int().min(-1).max(1_000_000).optional(),
    description: z.string().max(2000).optional().nullable(),
    websiteUrl: z.string().max(500).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Aucun champ à mettre à jour",
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve an organization by id. Returns null if missing OR ARCHIVED. */
async function findOrg(id: string) {
  return db.organization.findUnique({ where: { id }, select: { id: true } });
}

// ─── GET — organization details ───────────────────────────────────────────────

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

    const organization = await db.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                lastLoginAt: true,
              },
            },
          },
          orderBy: [{ status: 'asc' }, { joinedAt: 'desc' }],
        },
        weddings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            slug: true,
            coupleLabel: true,
            status: true,
            plan: true,
            weddingDate: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            members: { where: { status: 'ACTIVE' } },
            weddings: true,
          },
        },
      },
    });

    if (!organization) {
      return notFound("Organisation introuvable");
    }

    return NextResponse.json({ organization });
  } catch (error) {
    logger.error('Get platform organization error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── PATCH — update organization fields ───────────────────────────────────────

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

    const existing = await findOrg(id);
    if (!existing) return notFound("Organisation introuvable");

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = updateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // ─── Pre-flight uniqueness for email + customDomain (if changing) ──────────
    if (data.email) {
      const conflict = await db.organization.findFirst({
        where: { email: data.email, NOT: { id } },
        select: { id: true },
      });
      if (conflict) {
        return NextResponse.json(
          { error: 'Cet email est déjà utilisé par une autre organisation' },
          { status: 409 }
        );
      }
    }
    if (data.customDomain) {
      const conflict = await db.organization.findFirst({
        where: { customDomain: data.customDomain, NOT: { id } },
        select: { id: true },
      });
      if (conflict) {
        return NextResponse.json(
          { error: 'Ce domaine personnalisé est déjà utilisé' },
          { status: 409 }
        );
      }
    }

    const client = getClientInfo(request);

    // ─── P2.8: Route quota fields through updateOrgQuotas (validates values) ──
    // Quota fields are extracted + applied via the helper. The remaining
    // (non-quota) fields are applied inside the transaction below.
    const quotaFields: {
      maxWeddings?: number;
      maxMembers?: number;
      maxInvitationsPerMonth?: number;
    } = {};
    if (data.maxWeddings !== undefined) {
      quotaFields.maxWeddings = data.maxWeddings;
      delete (data as Record<string, unknown>).maxWeddings;
    }
    if (data.maxMembers !== undefined) {
      quotaFields.maxMembers = data.maxMembers;
      delete (data as Record<string, unknown>).maxMembers;
    }
    if (data.maxInvitationsPerMonth !== undefined) {
      quotaFields.maxInvitationsPerMonth = data.maxInvitationsPerMonth;
      delete (data as Record<string, unknown>).maxInvitationsPerMonth;
    }

    const hasQuotaUpdate =
      quotaFields.maxWeddings !== undefined ||
      quotaFields.maxMembers !== undefined ||
      quotaFields.maxInvitationsPerMonth !== undefined;

    // updateOrgQuotas throws on invalid values (e.g. < -1). Surface as 400.
    if (hasQuotaUpdate) {
      try {
        await updateOrgQuotas(id, quotaFields);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Quota invalide';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    // If nothing left to update (only quota fields were in the body),
    // short-circuit with the current org state + audit log.
    if (Object.keys(data).length === 0) {
      const org = await db.organization.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              members: { where: { status: 'ACTIVE' } },
              weddings: true,
            },
          },
        },
      });
      await db.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_ORGANIZATION',
          details: `Updated organization ${org?.slug}: ${Object.keys(quotaFields).join(', ')}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      if (org) {
        invalidateOrgThemeCache({ slug: org.slug, host: org.customDomain ?? undefined });
      }
      return NextResponse.json({ organization: org });
    }

    const updated = await db.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id },
        data,
        include: {
          _count: {
            select: {
              members: { where: { status: 'ACTIVE' } },
              weddings: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_ORGANIZATION',
          details: `Updated organization ${org.slug}: ${[
            ...Object.keys(data),
            ...(hasQuotaUpdate ? Object.keys(quotaFields) : []),
          ].join(', ')}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return org;
    });

    // P1.10: invalidate the org theme cache so brand changes propagate immediately
    invalidateOrgThemeCache({ slug: updated.slug, host: updated.customDomain ?? undefined });

    return NextResponse.json({ organization: updated });
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Cette valeur est déjà utilisée' },
        { status: 409 }
      );
    }
    logger.error('Update platform organization error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── DELETE — soft-delete (status = ARCHIVED) ─────────────────────────────────
//
// We do NOT hard-delete organizations — this preserves referential integrity
// (AdminUser.organizationId is onDelete:SetNull, Wedding.organizationId is
// onDelete:SetNull, OrganizationMember is onDelete:Cascade). Archiving keeps
// the row for audit history + financial reconciliation while removing it from
// the active list (status filter excludes ARCHIVED in normal queries).

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rlKey = getRateLimitKey(request);
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(rlKey, 5, 60_000);
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
      select: { id: true, slug: true, status: true },
    });
    if (!existing) return notFound("Organisation introuvable");
    if (existing.status === 'ARCHIVED') {
      return NextResponse.json(
        { error: "Cette organisation est déjà archivée" },
        { status: 409 }
      );
    }

    const client = getClientInfo(request);

    const archived = await db.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id },
        data: { status: 'ARCHIVED' },
        select: { id: true, slug: true, name: true, status: true },
      });

      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'ARCHIVE_ORGANIZATION',
          details: `Archived organization ${org.slug} (${org.name})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return org;
    });

    return NextResponse.json({ organization: archived });
  } catch (error) {
    logger.error('Delete platform organization error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

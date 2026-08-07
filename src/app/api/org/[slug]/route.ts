export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { isOrgRole, isPlatformAdmin } from '@/lib/types';
import { logger } from '@/lib/logger';
import { internalError, forbidden, unauthorized, badRequest } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { getClientInfo } from '@/lib/guest-auth';
import { invalidateOrgThemeCache } from '@/lib/wedding/theme-injector';

/**
 * Mission 6.0 P1.8 — Org-scoped organization details + settings.
 *
 * GET   /api/org/{slug}
 *   → 200 { organization, stats, recentActivity }
 *
 * PATCH /api/org/{slug}
 *   body: { name?, email?, phone?, logoUrl?, brandColor?, customDomain?,
 *           description?, websiteUrl?, address? }
 *   → 200 { organization }
 *   (Org-admin only. plan / maxWeddings / maxMembers / status are NOT
 *   editable here — those are platform-admin fields set via
 *   /api/platform/organizations/[id].)
 *
 * Auth (GET): caller must be platform admin OR org-scoped user belonging to
 *             this org.
 * Auth (PATCH): caller must be platform admin OR ORG_ADMIN of THIS org.
 *
 * Uses raw `db` (NOT tenantDb) — Organization is NOT a tenant-scoped model.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve an organization by slug. Returns null if missing or ARCHIVED. */
async function findOrgBySlug(slug: string) {
  return db.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      email: true,
      phone: true,
      logoUrl: true,
      brandColor: true,
      customDomain: true,
      status: true,
      plan: true,
      maxWeddings: true,
      maxMembers: true,
      description: true,
      websiteUrl: true,
      address: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/** Verify the caller may operate on this organization. Returns `user` or `null` (denied). */
async function authorizeOrgAccess(
  request: NextRequest,
  orgId: string,
  requireWrite: boolean
): Promise<{ authorized: boolean; user: Awaited<ReturnType<typeof getAuthUser>> }> {
  const user = await getAuthUser(request);
  if (!user) return { authorized: false, user: null };

  // Platform admins may access any org.
  if (isPlatformAdmin(user.role)) return { authorized: true, user };

  // Org-scoped users may access only their own org.
  if (isOrgRole(user.role) && user.organizationId === orgId) {
    // Write operations require ORG_ADMIN.
    if (requireWrite && user.role !== 'ORG_ADMIN') {
      return { authorized: false, user };
    }
    return { authorized: true, user };
  }

  return { authorized: false, user };
}

// ─── Zod schema for PATCH ─────────────────────────────────────────────────────

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
    description: z.string().max(2000).optional().nullable(),
    websiteUrl: z.string().max(500).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Aucun champ à mettre à jour',
  });

// ─── GET ──────────────────────────────────────────────────────────────────────

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
    if (!slug) return NextResponse.json({ error: 'Slug requis' }, { status: 400 });

    const org = await findOrgBySlug(slug);
    if (!org) {
      return NextResponse.json(
        { error: 'Organisation introuvable' },
        { status: 404 }
      );
    }

    const { authorized, user } = await authorizeOrgAccess(request, org.id, false);
    if (!user) return unauthorized();
    if (!authorized) return forbidden();

    // ─── Fetch stats + recent activity in parallel ──────────────────────────
    const [
      weddings,
      totalGuestsAgg,
      totalActiveMembersAgg,
      activeInvitationsAgg,
      recentActivity,
    ] = await Promise.all([
      // All weddings under this org (light projection — full list used by dashboard).
      db.wedding.findMany({
        where: { organizationId: org.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          slug: true,
          coupleLabel: true,
          brideName: true,
          groomName: true,
          status: true,
          plan: true,
          weddingDate: true,
          venueCity: true,
          createdAt: true,
          _count: { select: { guests: true, admins: true } },
        },
      }),
      // Total guests across all org weddings.
      db.guest.count({
        where: { wedding: { organizationId: org.id } },
      }),
      // Active members in this org.
      db.organizationMember.count({
        where: { organizationId: org.id, status: 'ACTIVE' },
      }),
      // Active (non-FAILED) invitations across all org weddings.
      // Invitation.status enum: PENDING | SENT | DELIVERED | FAILED | OPENED.
      // "Active" = anything that's not a hard failure (FAILED).
      db.invitation.count({
        where: {
          wedding: { organizationId: org.id },
          status: { not: 'FAILED' },
        },
      }),
      // Last 5 audit log entries scoped to this org's weddings (or org-level events).
      db.auditLog.findMany({
        where: {
          OR: [
            { wedding: { organizationId: org.id } },
            { action: { in: ['CREATE_ORGANIZATION', 'UPDATE_ORGANIZATION', 'ARCHIVE_ORGANIZATION', 'UPDATE_ORG_MEMBER', 'REVOKE_ORG_MEMBER'] } },
          ],
        },
        include: {
          user: { select: { name: true, email: true, role: true } },
          wedding: { select: { slug: true, coupleLabel: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return NextResponse.json({
      organization: org,
      weddings,
      stats: {
        totalWeddings: weddings.length,
        totalGuests: totalGuestsAgg,
        totalMembers: totalActiveMembersAgg,
        activeInvitations: activeInvitationsAgg,
      },
      recentActivity,
    });
  } catch (error) {
    logger.error('Get org (slug) error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── PATCH — update org settings (org-admin only) ─────────────────────────────
//
// Only the org-editable fields are exposed. Platform-admin fields
// (plan / maxWeddings / maxMembers / status / slug) are NOT editable here —
// those require /api/platform/organizations/[id].

export async function PATCH(
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

    const org = await db.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        customDomain: true,
        email: true,
        name: true,
      },
    });
    if (!org) {
      return NextResponse.json(
        { error: 'Organisation introuvable' },
        { status: 404 }
      );
    }

    const { authorized, user } = await authorizeOrgAccess(request, org.id, true);
    if (!user) return unauthorized();
    if (!authorized) return forbidden('Accès insuffisant : ORG_ADMIN requis');

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = updateOrgSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // ─── Pre-flight uniqueness for email + customDomain ──────────────────────
    if (data.email) {
      const conflict = await db.organization.findFirst({
        where: { email: data.email, NOT: { id: org.id } },
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
        where: { customDomain: data.customDomain, NOT: { id: org.id } },
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
    const previousCustomDomain = org.customDomain;

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.organization.update({
        where: { id: org.id },
        data,
        select: {
          id: true,
          slug: true,
          name: true,
          email: true,
          phone: true,
          logoUrl: true,
          brandColor: true,
          customDomain: true,
          status: true,
          plan: true,
          maxWeddings: true,
          maxMembers: true,
          description: true,
          websiteUrl: true,
          address: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_ORGANIZATION',
          details: `Org admin updated organization ${org.slug}: ${Object.keys(data).join(', ')}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return row;
    });

    // P1.10: invalidate the org theme cache so brand changes propagate immediately.
    invalidateOrgThemeCache({
      slug: updated.slug,
      host: previousCustomDomain ?? undefined,
    });
    if (updated.customDomain && updated.customDomain !== previousCustomDomain) {
      // Also invalidate the new custom domain entry (if it was previously cached).
      invalidateOrgThemeCache({ host: updated.customDomain });
    }

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
    logger.error('Update org (slug) error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { buildCoupleLabel, generateSlug } from '@/lib/types';
import { logger } from '@/lib/logger';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { getClientInfo } from '@/lib/guest-auth';
import { checkOrgWeddingLimit } from '@/lib/org-quotas'; // P2.8

/**
 * Mission 6.0 P2.8 — Platform-admin wedding creation under an organization.
 *
 * POST /api/platform/organizations/{id}/weddings
 *   body: {
 *     brideName?, groomName?, coupleLabel?,
 *     weddingDate? (YYYY-MM-DD), venueName?, venueCity?
 *   }
 *   → 201 { wedding }
 *
 * Platform-admin only. Mirrors the org-scoped POST /api/org/{slug}/weddings
 * route but resolved by org id (used by the platform admin console when
 * managing a specific org).
 *
 * P2.8: enforces maxWeddings quota via checkOrgWeddingLimit() before the
 * DB write. Returns 402 Payment Required if exceeded.
 */

const createWeddingSchema = z
  .object({
    brideName: z.string().trim().max(100).optional().or(z.literal('')).default(''),
    groomName: z.string().trim().max(100).optional().or(z.literal('')).default(''),
    coupleLabel: z.string().trim().max(200).optional().or(z.literal('')).default(''),
    weddingDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    venueName: z.string().trim().max(200).optional().or(z.literal('')).default(''),
    venueCity: z.string().trim().max(120).optional().or(z.literal('')).default(''),
  })
  .strict()
  .refine(
    (d) => !!(d.coupleLabel || d.brideName || d.groomName),
    {
      message: "Renseignez au moins le nom d'un des mariés ou le label du couple",
      path: ['coupleLabel'],
    },
  );

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rlKey = getRateLimitKey(request);
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(rlKey, 10, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds ?? 60) } },
      );
    }

    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    if (!id) return badRequest("Identifiant d'organisation requis");

    const org = await db.organization.findUnique({
      where: { id },
      select: { id: true, slug: true, status: true, plan: true },
    });
    if (!org) return notFound("Organisation introuvable");
    if (org.status === 'ARCHIVED') {
      return NextResponse.json(
        { error: "Impossible de créer un mariage dans une organisation archivée" },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = createWeddingSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // ─── P2.8: Enforce org wedding quota BEFORE the DB write ──────────────────
    const quota = await checkOrgWeddingLimit(org.id);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: `Quota dépassé: ${quota.current}/${quota.limit} mariages pour cette organisation`,
          quota: 'weddings',
          current: quota.current,
          limit: quota.limit,
        },
        { status: 402 },
      );
    }

    // ─── Build couple label + slug (globally unique) ──────────────────────────
    const coupleLabel =
      data.coupleLabel || buildCoupleLabel(data.brideName, data.groomName) || 'Mariage';
    const baseSlug = generateSlug(
      coupleLabel || `${data.brideName}-${data.groomName}`,
    );
    let weddingSlug = `${org.slug}-${baseSlug}`.slice(0, 60);
    const existing = await db.wedding.findUnique({
      where: { slug: weddingSlug },
      select: { id: true },
    });
    if (existing) {
      let suffix = 2;
      while (true) {
        const candidate = `${weddingSlug}-${suffix}`.slice(0, 80);
        const clash = await db.wedding.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        if (!clash) {
          weddingSlug = candidate;
          break;
        }
        suffix++;
        if (suffix > 99) break;
      }
    }

    const weddingDate = data.weddingDate
      ? new Date(data.weddingDate + 'T12:00:00Z')
      : null;

    const client = getClientInfo(request);

    const wedding = await db.$transaction(async (tx) => {
      const created = await tx.wedding.create({
        data: {
          slug: weddingSlug,
          brideName: data.brideName || '',
          groomName: data.groomName || '',
          coupleLabel,
          weddingDate,
          venueName: data.venueName || null,
          venueCity: data.venueCity || null,
          status: 'DRAFT',
          plan: org.plan,
          isDefault: false,
          organizationId: org.id,
        },
        select: {
          id: true,
          slug: true,
          coupleLabel: true,
          brideName: true,
          groomName: true,
          status: true,
          plan: true,
          weddingDate: true,
          venueName: true,
          venueCity: true,
          organizationId: true,
          createdAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          weddingId: created.id,
          userId: user!.id,
          action: 'CREATE_WEDDING',
          details: `Platform admin created wedding ${created.slug} under organization ${org.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return created;
    });

    return NextResponse.json({ wedding }, { status: 201 });
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Ce slug de mariage est déjà utilisé' },
        { status: 409 },
      );
    }
    logger.error('Create platform org wedding error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { isOrgRole, isPlatformAdmin, buildCoupleLabel, generateSlug } from '@/lib/types';
import { logger } from '@/lib/logger';
import { internalError, badRequest, notFound, forbidden, unauthorized } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { getClientInfo } from '@/lib/guest-auth';
import { checkOrgWeddingLimit } from '@/lib/org-quotas'; // P2.8

/**
 * Mission 6.0 P1.8 + P2.8 — Org-scoped weddings.
 *
 * GET  /api/org/{slug}/weddings?status=&plan=&search=
 *   → 200 { weddings, total }
 *
 * POST /api/org/{slug}/weddings
 *   body: {
 *     brideName?, groomName?, coupleLabel?,
 *     weddingDate? (YYYY-MM-DD), venueName?, venueCity?
 *   }
 *   → 201 { wedding }
 *
 * Auth: caller must be
 *   (a) a platform admin (cross-tenant), OR
 *   (b) an ORG_ADMIN or ORG_MEMBER of THIS org. (ORG_VIEWER → 403 on POST.)
 *
 * P2.8: enforces maxWeddings quota via checkOrgWeddingLimit() before the
 * DB write. Returns 402 Payment Required if exceeded.
 */

// ─── Zod schema for wedding creation ─────────────────────────────────────────

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

// ─── GET — list weddings (unchanged from P1.8) ───────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const rlKey = getRateLimitKey(request);
    const { allowed, retryAfterSeconds } = await checkRateLimitAsync(rlKey, 30, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez réessayer dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds ?? 60) } },
      );
    }

    const { slug } = await params;
    if (!slug) return badRequest('Slug requis');

    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const org = await db.organization.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (!org) return notFound('Organisation introuvable');

    const authorized =
      isPlatformAdmin(user.role) ||
      (isOrgRole(user.role) && user.organizationId === org.id);
    if (!authorized) return forbidden();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status')?.trim() || '';
    const plan = searchParams.get('plan')?.trim() || '';
    const search = searchParams.get('search')?.trim() || '';

    const where: Record<string, unknown> = { organizationId: org.id };
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (search) {
      where.OR = [
        { coupleLabel: { contains: search } },
        { slug: { contains: search } },
        { brideName: { contains: search } },
        { groomName: { contains: search } },
      ];
    }

    const [weddings, total] = await Promise.all([
      db.wedding.findMany({
        where,
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
      db.wedding.count({ where }),
    ]);

    return NextResponse.json({ weddings, total });
  } catch (error) {
    logger.error('List org weddings (slug) error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── POST — create a wedding under this org (P2.8) ───────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
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

    const { slug } = await params;
    if (!slug) return badRequest('Slug requis');

    const user = await getAuthUser(request);
    if (!user) return unauthorized();

    const org = await db.organization.findUnique({
      where: { slug },
      select: { id: true, slug: true, status: true, plan: true },
    });
    if (!org) return notFound('Organisation introuvable');

    // Authz: platform admin OR org-scoped user of THIS org.
    const isPlatform = isPlatformAdmin(user.role);
    if (!isPlatform) {
      if (!isOrgRole(user.role)) return forbidden();
      if (user.organizationId !== org.id) return forbidden();
      // ORG_VIEWER cannot create weddings.
      if (user.role === 'ORG_VIEWER') {
        return forbidden('Accès insuffisant : ORG_ADMIN ou ORG_MEMBER requis');
      }
    }

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

    // ─── Build couple label + slug (must be globally unique) ──────────────────
    const coupleLabel =
      data.coupleLabel || buildCoupleLabel(data.brideName, data.groomName) || 'Mariage';
    const baseSlug = generateSlug(
      coupleLabel || `${data.brideName}-${data.groomName}`,
    );
    let weddingSlug = `${org.slug}-${baseSlug}`.slice(0, 60);
    // De-duplicate slug if needed.
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
        if (suffix > 99) break; // safety
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
          plan: org.plan, // inherit org plan
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
          details: `Created wedding ${created.slug} under organization ${org.slug}`,
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
    logger.error('Create org wedding (slug) error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

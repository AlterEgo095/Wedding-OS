export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { internalError, badRequest } from '@/lib/api-errors';
import { checkRateLimitAsync, getRateLimitKey } from '@/lib/rate-limit';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * Mission 6.0 P1.6 — Platform-wide Organization management.
 *
 * GET  /api/platform/organizations?page=1&limit=20&status=&plan=&search=
 *   → { organizations, total, page, limit }
 *
 * POST /api/platform/organizations
 *   → 201 { organization }
 *
 * All queries use the raw `db` (NOT `tenantDb`) because platform admins need
 * cross-tenant aggregates — the tenant-scoped extension would incorrectly
 * filter results.
 *
 * Each organization row is enriched with `_count.members` (active members)
 * and `_count.weddings` (total weddings under this org).
 */

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const createOrgSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
      "Le slug doit être en kebab-case minuscule (ex: agence-mariage-cd)"
    ),
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  phone: z.string().max(40).optional().nullable().default(null),
  logoUrl: z.string().max(1000).optional().nullable().default(null),
  brandColor: z
    .string()
    .max(20)
    .regex(/^#[0-9a-fA-F]{3,8}$|^$/)
    .optional()
    .nullable()
    .default(null),
  customDomain: z.string().max(255).optional().nullable().default(null),
  plan: z.enum(['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE']).optional().default('TRIAL'),
  maxWeddings: z.number().int().min(1).max(10_000).optional().default(1),
  maxMembers: z.number().int().min(1).max(10_000).optional().default(5),
  description: z.string().max(2000).optional().nullable().default(null),
  websiteUrl: z.string().max(500).optional().nullable().default(null),
  address: z.string().max(500).optional().nullable().default(null),
});

// ─── GET — list organizations ─────────────────────────────────────────────────

async function getList(request: NextRequest) {
  try {
    // Rate limit: 30 req/min — listing with aggregates is moderately expensive.
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

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const status = searchParams.get('status')?.trim() || '';
    const plan = searchParams.get('plan')?.trim() || '';
    const search = searchParams.get('search')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;

    const [organizations, total] = await Promise.all([
      db.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              members: { where: { status: 'ACTIVE' } },
              weddings: true,
            },
          },
        },
      }),
      db.organization.count({ where }),
    ]);

    return NextResponse.json({
      organizations,
      total,
      page,
      limit,
    });
  } catch (error) {
    logger.error('Platform organizations list error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── POST — create a new organization ─────────────────────────────────────────

async function createHandler(request: NextRequest) {
  try {
    // Rate limit: 10 req/min — creates are heavier (slug uniqueness + tx).
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

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = createOrgSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // ─── Pre-flight uniqueness checks (slug, email, customDomain) ──────────────
    // These are advisory — the DB unique constraints are authoritative. The
    // pre-flight check gives us nicer 409 messages than the P2002 catch-all.
    const existingSlug = await db.organization.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (existingSlug) {
      return NextResponse.json(
        { error: 'Ce slug est déjà utilisé par une autre organisation' },
        { status: 409 }
      );
    }

    const existingEmail = await db.organization.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (existingEmail) {
      return NextResponse.json(
        { error: 'Cet email est déjà utilisé par une autre organisation' },
        { status: 409 }
      );
    }

    if (data.customDomain) {
      const existingDomain = await db.organization.findUnique({
        where: { customDomain: data.customDomain },
        select: { id: true },
      });
      if (existingDomain) {
        return NextResponse.json(
          { error: 'Ce domaine personnalisé est déjà utilisé' },
          { status: 409 }
        );
      }
    }

    const client = getClientInfo(request);

    const created = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          slug: data.slug,
          name: data.name,
          email: data.email,
          phone: data.phone,
          logoUrl: data.logoUrl,
          brandColor: data.brandColor,
          customDomain: data.customDomain,
          plan: data.plan,
          maxWeddings: data.maxWeddings,
          maxMembers: data.maxMembers,
          description: data.description,
          websiteUrl: data.websiteUrl,
          address: data.address,
          status: 'ACTIVE',
        },
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
          weddingId: null, // platform-level event
          userId: user!.id,
          action: 'CREATE_ORGANIZATION',
          details: `Created organization ${org.slug} (${org.name})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });

      return org;
    });

    return NextResponse.json({ organization: created }, { status: 201 });
  } catch (error: unknown) {
    // ─── Prisma P2002 — unique constraint violation ───────────────────────────
    // TOCTOU race: two concurrent POSTs with the same slug/email can both pass
    // the pre-flight check and the second create() throws P2002.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      const metaTarget = (error as { meta?: { target?: string[] } }).meta?.target;
      const target = Array.isArray(metaTarget) ? metaTarget.join(', ') : 'champ';
      return NextResponse.json(
        { error: `Cette valeur est déjà utilisée (${target})` },
        { status: 409 }
      );
    }
    logger.error('Create platform organization error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export const GET = getList;
export const POST = createHandler;

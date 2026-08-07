export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * Platform-wide brand identities (P3.1 — Brand Studio).
 *
 * GET  /api/platform/brands?status=&search=&page=1&limit=50
 *    → { brands, total, page, limit }
 *
 * POST /api/platform/brands  { name, slug, description?, logoUrl?, voiceToneJson?, ... }
 *    → 201 { brand }
 *
 * Platform-admin only. Uses unsafePlatformDb (no tenant scope — brands are
 * platform-wide reusable design assets, attachable to Organization or Wedding
 * via brandId FK).
 *
 * JSON fields (voiceToneJson / iconographyJson / colorsJson / typographyJson)
 * are stored as String in DB. The API accepts either a JSON-encoded string
 * or a parsed object; both are normalised to a JSON-encoded string before
 * storage. They are returned as raw JSON strings (the UI edits them in
 * <textarea> JSON editors).
 */

const BRAND_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logoAssetId: true,
  logoUrl: true,
  voiceToneJson: true,
  iconographyJson: true,
  colorsJson: true,
  typographyJson: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Accept either a JSON-encoded string or a parsed object; normalise to a
// JSON-encoded string for storage. Rejects malformed JSON.
const jsonField = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return '{}';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      try {
        return JSON.stringify(val);
      } catch {
        return '{}';
      }
    }
    return '{}';
  },
  z
    .string()
    .max(200_000)
    .refine(
      (s) => {
        try {
          JSON.parse(s);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Invalid JSON' }
    )
);

const createBrandSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  description: z.string().max(2000).optional().default(''),
  logoUrl: z.string().url().optional().nullable().default(null),
  logoAssetId: z.string().optional().nullable().default(null),
  voiceToneJson: jsonField.optional().default('{}'),
  iconographyJson: jsonField.optional().default('{}'),
  colorsJson: jsonField.optional().default('{}'),
  typographyJson: jsonField.optional().default('{}'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional().default('DRAFT'),
});

async function getList(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('limit') || '50', 10))
    );
    const status = searchParams.get('status')?.trim() || '';
    const search = searchParams.get('search')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (status && status !== 'ALL') where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;
    const [brands, total] = await Promise.all([
      db.brand.findMany({
        where,
        select: BRAND_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.brand.count({ where }),
    ]);

    return NextResponse.json({ brands, total, page, limit });
  } catch (error) {
    logger.error('List brands error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function createHandler(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = createBrandSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message || 'Données invalides'
      );
    }
    const data = parsed.data;

    // Slug uniqueness check (defensive — schema has @unique, but we want a
    // clean 409 instead of a raw P2002 leak).
    const existing = await db.brand.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Une brand avec ce slug existe déjà' },
        { status: 409 }
      );
    }

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const brand = await tx.brand.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          logoAssetId: data.logoAssetId ?? null,
          logoUrl: data.logoUrl ?? null,
          voiceToneJson: data.voiceToneJson,
          iconographyJson: data.iconographyJson,
          colorsJson: data.colorsJson,
          typographyJson: data.typographyJson,
          status: data.status,
        },
        select: BRAND_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'CREATE_BRAND',
          details: `Created brand ${data.slug} (${data.status})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return brand;
    });

    return NextResponse.json({ brand: created }, { status: 201 });
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Ce slug est déjà utilisé' },
        { status: 409 }
      );
    }
    logger.error('Create brand error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = getList;
export const POST = withRateLimit(30, 60_000)(createHandler);

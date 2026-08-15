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
 * Platform-wide visual theme presets (CONS-3-SUPER-ADMIN).
 *
 * GET  /api/platform/themes?status=&search=&tier=&category=&isPremium=&isRecommended=&approvalStatus=&page=&limit=
 * POST /api/platform/themes  { name, slug, paletteJson?, fontDisplay?, fontBody?, isBuiltIn?, status?,
 *                              isPremium?, isRecommended?, isDefault?, tier?, category?, version?, identity?, configJson? }
 *
 * MISSION 5.9.2 P1 — extended to expose the full P0+P1 fields (tier, category,
 * isPremium, isRecommended, isDefault, version, identity, configJson) and
 * support filtering by tier / category / isPremium / isRecommended.
 *
 * MISSION 5.9.2 P3-A — extended THEME_SELECT to include the new lock + approval
 * workflow fields (isLocked, lockedAt, lockedBy, approvalStatus, approvedAt,
 * approvedBy). Added the `approvalStatus` query param so the ThemesManager's
 * "Approbation" filter dropdown works server-side.
 *
 * Note: `approvalStatus` is SEPARATE from `status`:
 *   - `status` is the publication state (DRAFT/PUBLISHED/ARCHIVED) — backward compat
 *   - `approvalStatus` is the workflow state (DRAFT/REVIEW/APPROVED/PUBLISHED/LOCKED)
 * They coexist — a theme can be `status=PUBLISHED` + `approvalStatus=REVIEW`
 * (visible but pending re-approval after an edit).
 */

const THEME_SELECT = {
  id: true,
  name: true,
  slug: true,
  paletteJson: true,
  fontDisplay: true,
  fontBody: true,
  isBuiltIn: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  // P0 fields
  isPremium: true,
  isRecommended: true,
  isDefault: true,
  tier: true,
  category: true,
  version: true,
  identity: true,
  configJson: true,
      assetsJson: true,
  // P3-A — lock + approval workflow fields
  isLocked: true,
  lockedAt: true,
  lockedBy: true,
  approvalStatus: true,
  approvedAt: true,
  approvedBy: true,
} as const;

const createThemeSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  paletteJson: z.string().max(50_000).optional().default('{}'),
  fontDisplay: z.string().max(200).optional().nullable().default(null),
  fontBody: z.string().max(200).optional().nullable().default(null),
  isBuiltIn: z.boolean().optional().default(false),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional().default('PUBLISHED'),
  // P0/P1 fields (all optional with sensible defaults for backward compat)
  isPremium: z.boolean().optional().default(false),
  isRecommended: z.boolean().optional().default(false),
  isDefault: z.boolean().optional().default(false),
  tier: z.enum(['FREE', 'STANDARD', 'PREMIUM', 'EXCLUSIVE']).optional().default('STANDARD'),
  category: z.string().max(120).optional().nullable().default(null),
  version: z.string().max(40).optional().default('1.0.0'),
  identity: z.string().max(120).optional().nullable().default(null),
  configJson: z.string().max(200_000).optional().default('{}'),
  // P3-A — approval workflow. New themes start in DRAFT regardless of the
  // publication `status`. The /transition endpoint moves them through the
  // workflow; this field is accepted here for completeness but rarely set
  // directly by callers.
  approvalStatus: z
    .enum(['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'LOCKED'])
    .optional()
    .default('DRAFT'),
});

function parseBool(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

async function getList(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const rawStatus = searchParams.get('status')?.trim() || '';
    // Treat 'ALL' (sent by ThemesManager's default dropdown) as "no filter".
    // Only apply the status filter when it's a concrete status value.
    const status = rawStatus && rawStatus !== 'ALL' ? rawStatus : '';
    const search = searchParams.get('search')?.trim() || '';
    // P1 — new filters
    const tier = searchParams.get('tier')?.trim() || '';
    const category = searchParams.get('category')?.trim() || '';
    const isPremium = parseBool(searchParams.get('isPremium'));
    const isRecommended = parseBool(searchParams.get('isRecommended'));
    // P3-A — approval workflow filter (Tous / DRAFT / REVIEW / APPROVED / PUBLISHED / LOCKED)
    const rawApproval = searchParams.get('approvalStatus')?.trim() || '';
    const approvalStatus = rawApproval && rawApproval !== 'ALL' ? rawApproval : '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (tier) where.tier = tier;
    if (category) where.category = category;
    if (isPremium !== undefined) where.isPremium = isPremium;
    if (isRecommended !== undefined) where.isRecommended = isRecommended;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;
    const [themes, total] = await Promise.all([
      db.platformTheme.findMany({
        where,
        select: THEME_SELECT,
        orderBy: [
          { isDefault: 'desc' },
          { isRecommended: 'desc' },
          { isBuiltIn: 'desc' },
          { name: 'asc' },
        ],
        skip,
        take: limit,
      }),
      db.platformTheme.count({ where }),
    ]);

    return NextResponse.json({ themes, total, page, limit });
  } catch (error) {
    logger.error('List themes error', {
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

    const parsed = createThemeSchema.safeParse(body);
    if (!parsed.success) {
      // 5.8.17 FIX-P0-P1 (FIX 3): wrap Zod errors in a structured response
      // identical to /api/guests/route.ts. Previously we returned only the
      // first Zod issue's raw message verbatim ("Invalid input: expected
      // string, received undefined") with NO field name — clients had no
      // way to know WHICH field was missing. Now we return the full list of
      // issues, each with its path + message, under a French top-level
      // "Données invalides" label.
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const existing = await db.platformTheme.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Un thème avec ce slug existe déjà' },
        { status: 409 },
      );
    }

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const theme = await tx.platformTheme.create({
        data: {
          name: data.name,
          slug: data.slug,
          paletteJson: data.paletteJson,
          fontDisplay: data.fontDisplay ?? null,
          fontBody: data.fontBody ?? null,
          isBuiltIn: data.isBuiltIn,
          status: data.status,
          isPremium: data.isPremium,
          isRecommended: data.isRecommended,
          isDefault: data.isDefault,
          tier: data.tier,
          category: data.category ?? null,
          version: data.version,
          identity: data.identity ?? null,
          configJson: data.configJson,
          // P3-A — new themes start in DRAFT approval status (the workflow
          // moves them through REVIEW → APPROVED → PUBLISHED → LOCKED via
          // the /transition endpoint). isLocked defaults to false.
          approvalStatus: data.approvalStatus,
        },
        select: THEME_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'CREATE_THEME',
          details: `Created theme ${data.slug} (tier=${data.tier}, category=${data.category ?? 'null'}, approval=${data.approvalStatus})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return theme;
    });

    return NextResponse.json({ theme: created }, { status: 201 });
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Ce slug est déjà utilisé' },
        { status: 409 },
      );
    }
    logger.error('Create theme error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = getList;
export const POST = withRateLimit(30, 60_000)(createHandler);

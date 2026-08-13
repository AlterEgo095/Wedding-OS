export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';
import { invalidateInvitationRegistryCache } from '@/lib/invitations';

/**
 * Platform-wide invitation templates (MISSION 5.9.2 — Phase 5 API CRUD).
 *
 * GET  /api/platform/invitations?status=&tier=&category=&style=&identity=&
 *                              isPremium=&isRecommended=&isLocked=&
 *                              approvalStatus=&search=&page=&limit=
 * POST /api/platform/invitations  { slug, name, description?, category, style,
 *                                   layout, identity?, tier?, status?,
 *                                   isPremium?, isRecommended?, isDefault?,
 *                                   isBuiltIn?, version?, configJson?,
 *                                   assetsJson?, previewJson?, thumbnailUrl?,
 *                                   previewUrl?, themeId?, approvalStatus? }
 *
 * Mirrors the themes API pattern (src/app/api/platform/themes/route.ts) for
 * consistency. The InvitationTemplate model (prisma/schema.prisma §1449) holds
 * the canonical composition seed (configJson), and the registry cache
 * (lib/invitations/index.ts) is invalidated on every mutation so reads stay
 * fresh.
 *
 * Auth: PLATFORM_ADMIN only (requirePlatformAdmin). Mutations are rate-limited
 * (30 writes / 60s — same as themes). Every mutation writes an AuditLog entry
 * with action CREATE_INVITATION_TEMPLATE / UPDATE_INVITATION_TEMPLATE /
 * DELETE_INVITATION_TEMPLATE for the forensic trail (P5.2 audit enrichment).
 */

const INVITATION_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  // Visual identity
  category: true,
  style: true,
  layout: true,
  identity: true,
  // Commercial metadata
  tier: true,
  status: true,
  isLocked: true,
  lockedAt: true,
  lockedBy: true,
  approvalStatus: true,
  approvedAt: true,
  approvedBy: true,
  isBuiltIn: true,
  isPremium: true,
  isRecommended: true,
  isDefault: true,
  version: true,
  // Composition
  configJson: true,
  assetsJson: true,
  previewJson: true,
  thumbnailUrl: true,
  previewUrl: true,
  themeId: true,
  // Timestamps
  createdAt: true,
  updatedAt: true,
} as const;

const createInvitationSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  name: z.string().min(1).max(120),
  description: z.string().max(2_000).optional().nullable().default(null),
  // Visual identity
  category: z.enum(['LUXURY', 'EDITORIAL', 'BOTANICAL', 'CINEMATIC', 'CHAMPAGNE']),
  style: z.string().min(1).max(80),
  layout: z.enum([
    'FULL_BLEED',
    'EDITORIAL_GRID',
    'SPLIT_SCREEN',
    'CINEMATIC_HERO',
    'TYPOGRAPHIC_HERO',
    'ASYMMETRIC',
    'CENTERED_CEREMONY',
    'PHOTO_COLLAGE',
  ]),
  identity: z.string().max(120).optional().nullable().default(null),
  // Commercial metadata
  tier: z
    .enum(['FREE', 'STANDARD', 'PREMIUM', 'EXCLUSIVE'])
    .optional()
    .default('PREMIUM'),
  status: z
    .enum(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
    .optional()
    .default('DRAFT'),
  approvalStatus: z
    .enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'LOCKED', 'ARCHIVED'])
    .optional()
    .default('DRAFT'),
  isBuiltIn: z.boolean().optional().default(false),
  isPremium: z.boolean().optional().default(true),
  isRecommended: z.boolean().optional().default(false),
  isDefault: z.boolean().optional().default(false),
  version: z.number().int().min(1).optional().default(1),
  // Composition
  configJson: z.string().max(500_000).optional().default('{}'),
  assetsJson: z.string().max(50_000).optional().default('{}'),
  previewJson: z.string().max(50_000).optional().default('{}'),
  thumbnailUrl: z.string().max(2_000).optional().nullable().default(null),
  previewUrl: z.string().max(2_000).optional().nullable().default(null),
  themeId: z.string().max(120).optional().nullable().default(null),
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
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get('limit') || '20', 10)),
    );

    const rawStatus = searchParams.get('status')?.trim() || '';
    const status = rawStatus && rawStatus !== 'ALL' ? rawStatus : '';
    const search = searchParams.get('search')?.trim() || '';
    const tier = searchParams.get('tier')?.trim() || '';
    const category = searchParams.get('category')?.trim() || '';
    const style = searchParams.get('style')?.trim() || '';
    const identity = searchParams.get('identity')?.trim() || '';
    const isPremium = parseBool(searchParams.get('isPremium'));
    const isRecommended = parseBool(searchParams.get('isRecommended'));
    const isLocked = parseBool(searchParams.get('isLocked'));
    const rawApproval = searchParams.get('approvalStatus')?.trim() || '';
    const approvalStatus =
      rawApproval && rawApproval !== 'ALL' ? rawApproval : '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (tier) where.tier = tier;
    if (category) where.category = category;
    if (style) where.style = style;
    if (identity) where.identity = identity;
    if (isPremium !== undefined) where.isPremium = isPremium;
    if (isRecommended !== undefined) where.isRecommended = isRecommended;
    if (isLocked !== undefined) where.isLocked = isLocked;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;
    const [invitations, total] = await Promise.all([
      db.invitationTemplate.findMany({
        where,
        select: INVITATION_SELECT,
        orderBy: [
          { isDefault: 'desc' },
          { isRecommended: 'desc' },
          { isBuiltIn: 'desc' },
          { name: 'asc' },
        ],
        skip,
        take: limit,
      }),
      db.invitationTemplate.count({ where }),
    ]);

    return NextResponse.json({ invitations, total, page, limit });
  } catch (error) {
    logger.error('List invitation templates error', {
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

    const parsed = createInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    const existing = await db.invitationTemplate.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Un modèle d\'invitation avec ce slug existe déjà' },
        { status: 409 },
      );
    }

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const invitation = await tx.invitationTemplate.create({
        data: {
          slug: data.slug,
          name: data.name,
          description: data.description ?? null,
          category: data.category,
          style: data.style,
          layout: data.layout,
          identity: data.identity ?? null,
          tier: data.tier,
          status: data.status,
          approvalStatus: data.approvalStatus,
          isBuiltIn: data.isBuiltIn,
          isPremium: data.isPremium,
          isRecommended: data.isRecommended,
          isDefault: data.isDefault,
          version: data.version,
          configJson: data.configJson,
          assetsJson: data.assetsJson,
          previewJson: data.previewJson,
          thumbnailUrl: data.thumbnailUrl ?? null,
          previewUrl: data.previewUrl ?? null,
          themeId: data.themeId ?? null,
        },
        select: INVITATION_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'CREATE_INVITATION_TEMPLATE',
          details:
            `Created invitation template ${data.slug} ` +
            `(category=${data.category}, style=${data.style}, tier=${data.tier}, ` +
            `approval=${data.approvalStatus})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
          result: 'SUCCESS',
          targetType: 'INVITATION_TEMPLATE',
        },
      });
      return invitation;
    });

    // Bust the in-process registry cache so the next list/read sees the new row.
    invalidateInvitationRegistryCache();

    return NextResponse.json({ invitation: created }, { status: 201 });
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
    logger.error('Create invitation template error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = getList;
export const POST = withRateLimit(30, 60_000)(createHandler);

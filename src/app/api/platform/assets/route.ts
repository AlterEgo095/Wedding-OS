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
 * Platform-wide media assets library (CONS-3-SUPER-ADMIN).
 *
 * GET  /api/platform/assets?type=&search=&page=1&limit=20
 * POST /api/platform/assets  { name, type, url, sizeBytes?, metadata? }
 *
 * NOTE: this route accepts the asset URL in the JSON body (no multipart upload
 * here — uploads themselves are handled by /api/media). The platform asset
 * library is a registry of asset references (URL + metadata), not a binary
 * blob store.
 */

const ASSET_SELECT = {
  id: true,
  name: true,
  type: true,
  url: true,
  sizeBytes: true,
  metadata: true,
  createdAt: true,
} as const;

const VALID_TYPES = ['image', 'video', 'font'] as const;

const createAssetSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(VALID_TYPES),
  url: z.string().min(1).max(2000),
  sizeBytes: z.number().int().min(0).optional().default(0),
  metadata: z.string().max(50_000).optional().default('{}'),
});

async function getList(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const type = searchParams.get('type')?.trim() || '';
    const search = searchParams.get('search')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (search) {
      where.name = { contains: search };
    }

    const skip = (page - 1) * limit;
    const [assets, total] = await Promise.all([
      db.platformAsset.findMany({
        where,
        select: ASSET_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.platformAsset.count({ where }),
    ]);

    return NextResponse.json({ assets, total, page, limit });
  } catch (error) {
    logger.error('List assets error', {
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

    const parsed = createAssetSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const asset = await tx.platformAsset.create({
        data,
        select: ASSET_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'CREATE_ASSET',
          details: `Registered asset ${data.name} (${data.type})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return asset;
    });

    return NextResponse.json({ asset: created }, { status: 201 });
  } catch (error) {
    logger.error('Create asset error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = getList;
export const POST = withRateLimit(30, 60_000)(createHandler);

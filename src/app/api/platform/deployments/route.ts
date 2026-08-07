export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

/**
 * Platform-wide deployment list (CONS-3-SUPER-ADMIN).
 *
 * GET /api/platform/deployments?status=&weddingId=&page=1&limit=20
 *   → { deployments, total, page, limit }
 *
 * Lists all wedding frontend deployments across ALL weddings (no tenant
 * scope). Each deployment includes the wedding relation (slug, coupleLabel)
 * for display.
 */

const DEPLOYMENT_SELECT = {
  id: true,
  weddingId: true,
  templateId: true,
  version: true,
  status: true,
  url: true,
  logsJson: true,
  createdAt: true,
  updatedAt: true,
  wedding: {
    select: { id: true, slug: true, coupleLabel: true },
  },
  template: {
    select: { id: true, name: true, slug: true },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const status = searchParams.get('status')?.trim() || '';
    const weddingId = searchParams.get('weddingId')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (weddingId) where.weddingId = weddingId;

    const skip = (page - 1) * limit;
    const [deployments, total] = await Promise.all([
      db.deployment.findMany({
        where,
        select: DEPLOYMENT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.deployment.count({ where }),
    ]);

    return NextResponse.json({ deployments, total, page, limit });
  } catch (error) {
    logger.error('List deployments error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

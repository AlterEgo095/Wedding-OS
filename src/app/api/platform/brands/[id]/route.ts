export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';

/**
 * Per-brand operations (P3.1 — Brand Studio).
 *
 * GET    /api/platform/brands/{id}
 * PATCH  /api/platform/brands/{id}  { name?, description?, logoUrl?, ..., status? }
 * DELETE /api/platform/brands/{id}  → soft delete (status=ARCHIVED)
 *
 * DELETE is a soft archive: the row is preserved (Organisation.brandId /
 * Wedding.brandId FKs may still point at it; historical deployments reference
 * it via PublishedConfig.brand). The AuditLog records the archive action.
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

const jsonField = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return undefined; // undefined = no update
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
    .optional()
);

const updateBrandSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  logoUrl: z.string().url().nullable().optional(),
  logoAssetId: z.string().nullable().optional(),
  voiceToneJson: jsonField,
  iconographyJson: jsonField,
  colorsJson: jsonField,
  typographyJson: jsonField,
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const brand = await db.brand.findUnique({
      where: { id },
      select: BRAND_SELECT,
    });
    if (!brand) return notFound('Brand introuvable');
    return NextResponse.json({ brand });
  } catch (error) {
    logger.error('Get brand error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = updateBrandSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(
        parsed.error.issues[0]?.message || 'Données invalides'
      );
    }

    const existing = await db.brand.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!existing) return notFound('Brand introuvable');

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      // Strip undefined fields so Prisma doesn't touch them.
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v !== undefined) data[k] = v;
      }
      const brand = await tx.brand.update({
        where: { id },
        data,
        select: BRAND_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_BRAND',
          details: `Updated brand ${brand.slug} (fields: ${Object.keys(data).join(',')})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return brand;
    });

    return NextResponse.json({ brand: updated });
  } catch (error) {
    logger.error('Update brand error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const existing = await db.brand.findUnique({
      where: { id },
      select: { id: true, slug: true, status: true },
    });
    if (!existing) return notFound('Brand introuvable');

    const client = getClientInfo(request);
    const archived = await db.$transaction(async (tx) => {
      const brand = await tx.brand.update({
        where: { id },
        data: { status: 'ARCHIVED' },
        select: BRAND_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'ARCHIVE_BRAND',
          details: `Archived brand ${existing.slug} (was ${existing.status})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return brand;
    });

    return NextResponse.json({ brand: archived, ok: true });
  } catch (error) {
    logger.error('Archive brand error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PATCH = withRateLimit(30, 60_000)(patchHandler);
export const DELETE = withRateLimit(20, 60_000)(deleteHandler);

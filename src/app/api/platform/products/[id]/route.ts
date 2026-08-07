export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';
import { safeJsonParse } from '@/lib/safe-json';

/**
 * P3.3 — Per-product operations (platform-admin only).
 *
 * GET    /api/platform/products/{id}
 * PATCH  /api/platform/products/{id}  { name?, description?, bundleJson?, priceCents?, currency?, licence?, status? }
 * DELETE /api/platform/products/{id}  → soft-delete (sets status=ARCHIVED). The
 *        row is preserved because Entitlement.productId references it; physical
 *        deletion would break historical entitlement lookups.
 */

const PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  bundleJson: true,
  priceCents: true,
  currency: true,
  licence: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const addOnSchema = z.object({
  type: z.enum(['SMS_CREDITS', 'EXPORT_CREDITS', 'QR_CREDITS', 'WHATSAPP_CREDITS']),
  quantity: z.number().int().min(0),
});

const featureSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.string().max(200),
});

const bundleJsonSchema = z.object({
  collectionIds: z.array(z.string().min(1).max(80)).max(200).optional().default([]),
  addOns: z.array(addOnSchema).max(100).optional().default([]),
  features: z.array(featureSchema).max(100).optional().default([]),
}).optional();

const updateProductSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(4000).optional(),
  bundleJson: bundleJsonSchema,
  priceCents: z.number().int().min(0).max(100_000_00).optional(),
  currency: z.string().min(3).max(3).optional(),
  licence: z.enum(['STANDARD', 'EXCLUSIVE', 'CUSTOM']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});

function normalizeBundle(raw: string | null): {
  collectionIds: string[];
  addOns: Array<{ type: string; quantity: number }>;
  features: Array<{ key: string; value: string }>;
} {
  const DEFAULT = { collectionIds: [], addOns: [], features: [] };
  if (!raw) return DEFAULT;
  const parsed = safeJsonParse(raw, DEFAULT);
  return {
    collectionIds: Array.isArray(parsed?.collectionIds) ? parsed.collectionIds : [],
    addOns: Array.isArray(parsed?.addOns) ? parsed.addOns : [],
    features: Array.isArray(parsed?.features) ? parsed.features : [],
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const product = await db.product.findUnique({
      where: { id },
      select: PRODUCT_SELECT,
    });
    if (!product) return notFound('Produit introuvable');
    return NextResponse.json({
      product: { ...product, bundleJson: normalizeBundle(product.bundleJson) },
    });
  } catch (error) {
    logger.error('Get product error', {
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

    const parsed = updateProductSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }

    const existing = await db.product.findUnique({
      where: { id },
      select: { ...PRODUCT_SELECT },
    });
    if (!existing) return notFound('Produit introuvable');

    // Compute the data to write. If bundleJson is provided, stringify it.
    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.priceCents !== undefined) data.priceCents = parsed.data.priceCents;
    if (parsed.data.currency !== undefined) data.currency = parsed.data.currency;
    if (parsed.data.licence !== undefined) data.licence = parsed.data.licence;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.bundleJson !== undefined) {
      data.bundleJson = JSON.stringify(parsed.data.bundleJson);
    }

    // Diff for audit logging — capture priceCents and bundleJson before/after.
    const diffs: string[] = [];
    if (parsed.data.priceCents !== undefined && parsed.data.priceCents !== existing.priceCents) {
      diffs.push(`priceCents: ${existing.priceCents} → ${parsed.data.priceCents}`);
    }
    if (parsed.data.currency !== undefined && parsed.data.currency !== existing.currency) {
      diffs.push(`currency: ${existing.currency} → ${parsed.data.currency}`);
    }
    if (parsed.data.licence !== undefined && parsed.data.licence !== existing.licence) {
      diffs.push(`licence: ${existing.licence} → ${parsed.data.licence}`);
    }
    if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
      diffs.push(`status: ${existing.status} → ${parsed.data.status}`);
    }
    if (parsed.data.name !== undefined && parsed.data.name !== existing.name) {
      diffs.push(`name: "${existing.name}" → "${parsed.data.name}"`);
    }
    if (parsed.data.bundleJson !== undefined) {
      const beforeStr = existing.bundleJson || '{}';
      const afterStr = JSON.stringify(parsed.data.bundleJson);
      if (beforeStr !== afterStr) {
        // Truncate the before/after payloads to keep the audit log readable.
        const before = beforeStr.length > 200 ? beforeStr.slice(0, 200) + '…' : beforeStr;
        const after = afterStr.length > 200 ? afterStr.slice(0, 200) + '…' : afterStr;
        diffs.push(`bundleJson: ${before} → ${after}`);
      }
    }

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data,
        select: PRODUCT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_PRODUCT',
          details: `Updated product ${product.slug}${diffs.length ? ' | ' + diffs.join(' | ') : ''}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return product;
    });

    return NextResponse.json({
      product: { ...updated, bundleJson: normalizeBundle(updated.bundleJson) },
    });
  } catch (error) {
    logger.error('Update product error', {
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
    const existing = await db.product.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true, status: true },
    });
    if (!existing) return notFound('Produit introuvable');

    const client = getClientInfo(request);

    // Soft-delete: archive the product. The row is preserved so historical
    // Entitlement.productId lookups still resolve (resolveProducts pipeline
    // stage reads active Entitlements; archived products simply stop being
    // selectable for new purchases).
    const updated = await db.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: { status: 'ARCHIVED' },
        select: PRODUCT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'ARCHIVE_PRODUCT',
          details: `Archived product ${existing.slug} (previous status: ${existing.status})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return product;
    });

    return NextResponse.json({
      ok: true,
      product: { ...updated, bundleJson: normalizeBundle(updated.bundleJson) },
    });
  } catch (error) {
    logger.error('Archive product error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PATCH = withRateLimit(30, 60_000)(patchHandler);
export const DELETE = withRateLimit(20, 60_000)(deleteHandler);

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';
import { safeJsonParse } from '@/lib/safe-json';

/**
 * P3.3 — Products API (platform-admin only).
 *
 * A Product is a sellable pipeline artifact that bundles 1+ Collections +
 * add-ons + pricing + licensing. It sits ABOVE Collection in the pipeline
 * vision. The `bundleJson` column stores:
 *   {
 *     collectionIds: string[],
 *     addOns:        Array<{ type: 'SMS_CREDITS'|'EXPORT_CREDITS'|'QR_CREDITS'|'WHATSAPP_CREDITS', quantity: number }>,
 *     features:      Array<{ key: string, value: string }>
 *   }
 *
 * Products are purchased via CommercialOrder/OrderItem; on purchase an
 * Entitlement row is created with productId set. The deployment pipeline's
 * `resolveProducts` stage already reads the wedding's active Entitlement and
 * embeds the Product into PublishedConfig.product.
 *
 * GET  /api/platform/products?status=&search=&licence=&page=1&limit=20
 *      → { products, total, page, limit }
 *
 * POST /api/platform/products  { name, slug, description?, bundleJson?, priceCents?, currency?, licence?, status? }
 *      → 201 { product }
 *
 * Platform-admin only. Uses unsafePlatformDb (no tenant scope — these are
 * platform-wide sellable artifacts, just like Templates & Collections).
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
}).optional().default({ collectionIds: [], addOns: [], features: [] });

const createProductSchema = z.object({
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(160).regex(/^[a-z0-9-]+$/, 'slug must be lowercase kebab-case'),
  description: z.string().max(4000).optional().default(''),
  bundleJson: bundleJsonSchema,
  priceCents: z.number().int().min(0).max(100_000_00).optional().default(0), // max $10,000
  currency: z.string().min(3).max(3).optional().default('USD'),
  licence: z.enum(['STANDARD', 'EXCLUSIVE', 'CUSTOM']).optional().default('STANDARD'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional().default('DRAFT'),
});

// Defensive normalization — same pattern as collections route. A malformed
// bundleJson column on one row never 500s the whole list response.
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

async function getList(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const status = searchParams.get('status')?.trim() || '';
    const licence = searchParams.get('licence')?.trim() || '';
    const search = searchParams.get('search')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (licence) where.licence = licence;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      db.product.findMany({
        where,
        select: PRODUCT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.product.count({ where }),
    ]);

    const products = rows.map((p) => ({
      ...p,
      bundleJson: normalizeBundle(p.bundleJson),
    }));

    return NextResponse.json({ products, total, page, limit });
  } catch (error) {
    logger.error('List products error', {
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

    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }
    const data = parsed.data;

    // Slug uniqueness check (defensive — also enforced by P2002 catch below).
    const existing = await db.product.findUnique({
      where: { slug: data.slug },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Un produit avec ce slug existe déjà' },
        { status: 409 }
      );
    }

    const bundleJsonStr = JSON.stringify(data.bundleJson);
    const client = getClientInfo(request);
    const created = await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          bundleJson: bundleJsonStr,
          priceCents: data.priceCents,
          currency: data.currency,
          licence: data.licence,
          status: data.status,
        },
        select: PRODUCT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'CREATE_PRODUCT',
          details: `Created product ${data.slug} (licence=${data.licence}, status=${data.status}, price=${data.priceCents} ${data.currency}, bundle=${bundleJsonStr})`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return product;
    });

    return NextResponse.json({
      product: { ...created, bundleJson: normalizeBundle(created.bundleJson) },
    }, { status: 201 });
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
    logger.error('Create product error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const GET = getList;
export const POST = withRateLimit(30, 60_000)(createHandler);

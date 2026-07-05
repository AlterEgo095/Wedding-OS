export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { withPublicTenant } from '@/lib/tenant-context';
import { listCollections } from '@/lib/collections';
import type { Plan } from '@/lib/types';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { badRequest } from '@/lib/api-errors';

/**
 * GET /api/collections — public catalog list, filtered by the resolved wedding's plan.
 */
export const GET = withPublicTenant(async (_req, ctx) => {
  try {
    const plan = ctx.plan as Plan
    const collections = await listCollections(plan)
    return NextResponse.json({ collections })
  } catch (error) {
    console.error('List collections error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/collections — PLATFORM_ADMIN only (Slice 3: Collection Factory CRUD)
// ══════════════════════════════════════════════════════════════════════════════
// Creates a new Collection in the DATABASE. The static catalog is seed-only;
// all runtime collections come from the DB.
//
// Body: { name, slug, description?, category?, themeSeed: { primaryColor, accentColor,
//         fontDisplay, fontBody, layout }, luxuryPreset? }
//
// After creation, the collection can be assigned to a wedding via
// /api/collections/deploy.
// ══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'SUPER_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden — PLATFORM_ADMIN required' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const { name, slug, description, category, themeSeed, luxuryPreset } = body as {
      name?: string;
      slug?: string;
      description?: string;
      category?: string;
      themeSeed?: { primaryColor: string; accentColor: string; fontDisplay: string; fontBody: string; layout: string };
      luxuryPreset?: Record<string, unknown> | null;
    };

    if (!name || !slug) return badRequest('name et slug sont requis');
    if (!themeSeed || !themeSeed.layout) return badRequest('themeSeed.layout est requis');

    // Validate slug uniqueness
    const existing = await (await import('@/lib/db')).db.collection.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: `Le slug "${slug}" existe déjà` }, { status: 409 });
    }

    const db = (await import('@/lib/db')).db;

    // Determine the max sortOrder
    const maxSort = await db.collection.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

    const collection = await db.collection.create({
      data: {
        name,
        slug,
        description: description || null,
        category: category || 'CUSTOM',
        tier: 'FREE',
        isActive: true,
        isPublished: false, // new collections start unpublished
        status: 'BROUILLON',
        version: '0.1.0',
        sortOrder,
        themeSeed: JSON.stringify(themeSeed),
        luxuryPreset: luxuryPreset ? JSON.stringify(luxuryPreset) : null,
      },
    });

    // Create a default variant "A"
    await db.collectionVariant.create({
      data: {
        collectionId: collection.id,
        code: 'A',
        name: 'Version A — Défaut',
        isDefault: true,
      },
    });

    await writeAuditLog({
      weddingId: user.weddingId || '',
      userId: user.id,
      action: 'CREATE_COLLECTION',
      details: `Created Collection "${name}" (${slug}) — ${collection.id}`,
      request,
    });

    return NextResponse.json({ success: true, collection }, { status: 201 });
  } catch (error) {
    logger.error('Create collection error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to create collection', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

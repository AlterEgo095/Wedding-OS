export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════════════════════
// /api/platform/experience/weddings/[id]/variants
// Mission 6.0 Phase 3.4 — A/B variant configuration.
// ════════════════════════════════════════════════════════════════════════════
//
// GET    — list all ExperienceVariant rows for the wedding (ordered by
//          sectionId, then variantCode).
// POST   — create a single new variant. Enforces @@unique([weddingId,
//          sectionId, variantCode]) via upsert-style existence check.
// PATCH  — bulk update trafficPct / isActive for multiple variants at once
//          (used by the "traffic allocation" UI where the user drags
//          sliders for several variants in one save action).
//
// Auth: PLATFORM_ADMIN OR wedding admin (ORGANIZER / org-scoped). Uses
// assertWeddingAccessAsync for the access check so org-scoped users
// (ORG_ADMIN/ORG_MEMBER/ORG_VIEWER) can also manage their org's weddings.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import {
  getAuthUser,
  assertWeddingAccessAsync,
} from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import {
  internalError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
} from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { writeAuditLog } from '@/lib/audit';

const VARIANT_SELECT = {
  id: true,
  weddingId: true,
  sectionId: true,
  variantCode: true,
  trafficPct: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const createVariantSchema = z.object({
  sectionId: z.string().min(1).max(120),
  variantCode: z.enum(['A', 'B', 'C']),
  trafficPct: z.number().int().min(0).max(100).default(50),
  description: z.string().max(500).optional().default(''),
  isActive: z.boolean().optional().default(true),
});

const bulkUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().min(1),
        trafficPct: z.number().int().min(0).max(100).optional(),
        isActive: z.boolean().optional(),
        description: z.string().max(500).optional(),
      })
    )
    .min(1)
    .max(50),
});

/**
 * Resolve auth + wedding access for the requested weddingId. Returns either
 * an error NextResponse (to be returned immediately) or the user object.
 */
async function authorize(
  request: NextRequest,
  weddingId: string
): Promise<{ ok: true; user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>> } | { ok: false; response: NextResponse }> {
  const user = await getAuthUser(request);
  if (!user) return { ok: false, response: unauthorized() };
  const hasAccess = await assertWeddingAccessAsync(user, weddingId);
  if (!hasAccess) return { ok: false, response: forbidden() };
  // Confirm wedding exists (assertWeddingAccessAsync already does for
  // org-scoped users, but not for PLATFORM_ADMIN who skip the DB lookup).
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: { id: true },
  });
  if (!wedding) return { ok: false, response: notFound('Mariage introuvable') };
  return { ok: true, user };
}

// ─── GET — list variants ─────────────────────────────────────────────────────
async function listVariants(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: weddingId } = await params;
    const auth = await authorize(request, weddingId);
    if (!auth.ok) return auth.response;

    const variants = await db.experienceVariant.findMany({
      where: { weddingId },
      select: VARIANT_SELECT,
      orderBy: [{ sectionId: 'asc' }, { variantCode: 'asc' }],
    });
    return NextResponse.json({ variants });
  } catch (error) {
    logger.error('experience.variants.list error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

// ─── POST — create variant ───────────────────────────────────────────────────
async function createVariant(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: weddingId } = await params;
    const auth = await authorize(request, weddingId);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');
    const parsed = createVariantSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(
        'Champs invalides: sectionId requis, variantCode A|B|C, trafficPct 0-100'
      );
    }
    const data = parsed.data;

    // Enforce unique constraint manually to return a clean 409 (Prisma's
    // P2002 is also caught below as a safety net).
    const existing = await db.experienceVariant.findUnique({
      where: {
        weddingId_sectionId_variantCode: {
          weddingId,
          sectionId: data.sectionId,
          variantCode: data.variantCode,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return conflict(
        `La variante ${data.variantCode} existe déjà pour la section "${data.sectionId}"`
      );
    }

    const variant = await db.experienceVariant.create({
      data: {
        weddingId,
        sectionId: data.sectionId,
        variantCode: data.variantCode,
        trafficPct: data.trafficPct,
        description: data.description,
        isActive: data.isActive,
      },
      select: VARIANT_SELECT,
    });

    await writeAuditLog({
      weddingId,
      userId: auth.user.id,
      action: 'EXPERIENCE_VARIANT_CREATE',
      details: `Created variant ${data.variantCode} for section ${data.sectionId} (${data.trafficPct}%)`,
      request,
    });

    return NextResponse.json({ variant }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return conflict('Cette variante existe déjà pour cette section');
    }
    logger.error('experience.variants.create error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

// ─── PATCH — bulk update variants ───────────────────────────────────────────
async function bulkUpdateVariants(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: weddingId } = await params;
    const auth = await authorize(request, weddingId);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');
    const parsed = bulkUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest('updates[] requis (id + trafficPct|isActive|description)');
    }
    const updates = parsed.data.updates;

    // Verify all variant IDs belong to this wedding (prevent cross-wedding
    // edits via injected IDs).
    const ids = updates.map((u) => u.id);
    const owned = await db.experienceVariant.findMany({
      where: { id: { in: ids }, weddingId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((o) => o.id));
    if (ownedSet.size !== ids.length) {
      return forbidden('Un ou plusieurs IDs de variante n\'appartiennent pas à ce mariage');
    }

    // Apply updates in a transaction — all-or-nothing.
    await db.$transaction(
      updates.map((u) =>
        db.experienceVariant.update({
          where: { id: u.id },
          data: {
            ...(u.trafficPct !== undefined ? { trafficPct: u.trafficPct } : {}),
            ...(u.isActive !== undefined ? { isActive: u.isActive } : {}),
            ...(u.description !== undefined ? { description: u.description } : {}),
          },
        })
      )
    );

    const refreshed = await db.experienceVariant.findMany({
      where: { id: { in: ids } },
      select: VARIANT_SELECT,
      orderBy: [{ sectionId: 'asc' }, { variantCode: 'asc' }],
    });

    await writeAuditLog({
      weddingId,
      userId: auth.user.id,
      action: 'EXPERIENCE_VARIANT_BULK_UPDATE',
      details: `Bulk-updated ${updates.length} variant(s)`,
      request,
    });

    return NextResponse.json({ variants: refreshed });
  } catch (error) {
    logger.error('experience.variants.bulkUpdate error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

// Rate-limit the write endpoints (30/min/IP) — tracking is the high-volume
// endpoint, these admin endpoints are low-volume but still gated.
export const GET = listVariants;
export const POST = withRateLimit(30, 60_000)(createVariant);
export const PATCH = withRateLimit(30, 60_000)(bulkUpdateVariants);

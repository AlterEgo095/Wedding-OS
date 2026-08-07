export const dynamic = 'force-dynamic';

// ════════════════════════════════════════════════════════════════════════════
// /api/platform/experience/weddings/[id]/variants/[variantId]
// Mission 6.0 Phase 3.4 — Single-variant CRUD.
// ════════════════════════════════════════════════════════════════════════════
//
// PATCH   — update a single variant's trafficPct / isActive / description.
// DELETE  — remove a variant (e.g. when an A/B test concludes and the loser
//           is retired). The default "A" variant created by the pipeline
//           can also be deleted — the pipeline re-creates it on next publish.
//
// Auth: PLATFORM_ADMIN OR wedding admin (ORGANIZER / org-scoped).

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

const updateVariantSchema = z.object({
  trafficPct: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(500).optional(),
  // Allow moving a variant to a different section (advanced use case).
  sectionId: z.string().min(1).max(120).optional(),
  variantCode: z.enum(['A', 'B', 'C']).optional(),
});

async function authorize(
  request: NextRequest,
  weddingId: string
): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>> }
  | { ok: false; response: NextResponse }
> {
  const user = await getAuthUser(request);
  if (!user) return { ok: false, response: unauthorized() };
  const hasAccess = await assertWeddingAccessAsync(user, weddingId);
  if (!hasAccess) return { ok: false, response: forbidden() };
  return { ok: true, user };
}

async function patchVariant(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { id: weddingId, variantId } = await params;
    const auth = await authorize(request, weddingId);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');
    const parsed = updateVariantSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest('Champs invalides');
    }
    const data = parsed.data;

    // Ensure the variant exists AND belongs to this wedding (the
    // @@unique index is per-wedding, so cross-wedding lookups must be
    // explicit).
    const existing = await db.experienceVariant.findFirst({
      where: { id: variantId, weddingId },
      select: { id: true },
    });
    if (!existing) return notFound('Variante introuvable');

    const updated = await db.experienceVariant.update({
      where: { id: variantId },
      data: {
        ...(data.trafficPct !== undefined ? { trafficPct: data.trafficPct } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.sectionId !== undefined ? { sectionId: data.sectionId } : {}),
        ...(data.variantCode !== undefined ? { variantCode: data.variantCode } : {}),
      },
      select: VARIANT_SELECT,
    });

    await writeAuditLog({
      weddingId,
      userId: auth.user.id,
      action: 'EXPERIENCE_VARIANT_UPDATE',
      details: `Updated variant ${variantId} (${JSON.stringify(data)})`,
      request,
    });

    return NextResponse.json({ variant: updated });
  } catch (error) {
    logger.error('experience.variant.patch error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function deleteVariant(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { id: weddingId, variantId } = await params;
    const auth = await authorize(request, weddingId);
    if (!auth.ok) return auth.response;

    const existing = await db.experienceVariant.findFirst({
      where: { id: variantId, weddingId },
      select: { id: true, variantCode: true, sectionId: true },
    });
    if (!existing) return notFound('Variante introuvable');

    await db.experienceVariant.delete({ where: { id: variantId } });

    await writeAuditLog({
      weddingId,
      userId: auth.user.id,
      action: 'EXPERIENCE_VARIANT_DELETE',
      details: `Deleted variant ${existing.variantCode} for section ${existing.sectionId}`,
      request,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('experience.variant.delete error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PATCH = withRateLimit(30, 60_000)(patchVariant);
export const DELETE = withRateLimit(30, 60_000)(deleteVariant);

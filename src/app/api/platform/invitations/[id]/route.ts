export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { unsafePlatformDb as db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { internalError, badRequest, notFound } from '@/lib/api-errors';
import { logger } from '@/lib/logger';
import { getClientInfo } from '@/lib/guest-auth';
import { invalidateInvitationRegistryCache } from '@/lib/invitations';

/**
 * GET    /api/platform/invitations/[id]  — fetch one invitation template (full detail).
 * PUT    /api/platform/invitations/[id]  — update a template (auto-bumps version on
 *                                          substantive edits — configJson/assetsJson/
 *                                          previewJson/identity/style/layout change).
 * DELETE /api/platform/invitations/[id]  — delete (blocks isBuiltIn; blocks isLocked).
 *
 * Mirrors the themes/[id] pattern (src/app/api/platform/themes/[id]/route.ts) for
 * consistency. Lock enforcement (423) mirrors themes: a locked template cannot be
 * mutated via PUT or DELETE — the dedicated /lock + /unlock endpoints (Phase 6)
 * are the only way to mutate a locked template.
 */

const INVITATION_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  category: true,
  style: true,
  layout: true,
  identity: true,
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
  configJson: true,
  assetsJson: true,
  previewJson: true,
  thumbnailUrl: true,
  previewUrl: true,
  themeId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const updateInvitationSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2_000).nullable().optional(),
  category: z
    .enum(['LUXURY', 'EDITORIAL', 'BOTANICAL', 'CINEMATIC', 'CHAMPAGNE'])
    .optional(),
  style: z.string().min(1).max(80).optional(),
  layout: z
    .enum([
      'FULL_BLEED',
      'EDITORIAL_GRID',
      'SPLIT_SCREEN',
      'CINEMATIC_HERO',
      'TYPOGRAPHIC_HERO',
      'ASYMMETRIC',
      'CENTERED_CEREMONY',
      'PHOTO_COLLAGE',
    ])
    .optional(),
  identity: z.string().max(120).nullable().optional(),
  tier: z.enum(['FREE', 'STANDARD', 'PREMIUM', 'EXCLUSIVE']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  approvalStatus: z
    .enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'LOCKED', 'ARCHIVED'])
    .optional(),
  isBuiltIn: z.boolean().optional(),
  isPremium: z.boolean().optional(),
  isRecommended: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  version: z.number().int().min(1).optional(),
  configJson: z.string().max(500_000).optional(),
  assetsJson: z.string().max(50_000).optional(),
  previewJson: z.string().max(50_000).optional(),
  thumbnailUrl: z.string().max(2_000).nullable().optional(),
  previewUrl: z.string().max(2_000).nullable().optional(),
  themeId: z.string().max(120).nullable().optional(),
});

/**
 * Auto-bump the template version on substantive edits. Metadata-only edits
 * (isPremium, isRecommended, isDefault, status, tier, name, description) don't
 * bump — they describe the template in the catalog but don't change what gets
 * rendered. Substantive edits (configJson, assetsJson, previewJson, identity,
 * style, layout, category) DO bump because they change the rendered output.
 *
 * This preserves the snapshot-ability invariant: a wedding pinned to V3 via
 * invitationSnapshotId stays on V3 even after the live template is bumped
 * to V4 (the snapshot row is immutable).
 */
function isSubstantiveEdit(
  data: z.infer<typeof updateInvitationSchema>,
): boolean {
  return (
    data.configJson !== undefined ||
    data.assetsJson !== undefined ||
    data.previewJson !== undefined ||
    data.identity !== undefined ||
    data.style !== undefined ||
    data.layout !== undefined ||
    data.category !== undefined
  );
}

function lockedResponse(): NextResponse {
  return NextResponse.json(
    {
      error:
        'Modèle d\'invitation verrouillé — déverrouillez-le avant de le modifier',
    },
    { status: 423 },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const invitation = await db.invitationTemplate.findUnique({
      where: { id },
      select: INVITATION_SELECT,
    });
    if (!invitation) return notFound('Modèle d\'invitation introuvable');
    return NextResponse.json({ invitation });
  } catch (error) {
    logger.error('Get invitation template error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function putHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const parsed = updateInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }

    const existing = await db.invitationTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        version: true,
        isLocked: true,
      },
    });
    if (!existing) return notFound('Modèle d\'invitation introuvable');

    if (existing.isLocked) {
      return lockedResponse();
    }

    const data = parsed.data;
    if (isSubstantiveEdit(data) && data.version === undefined) {
      data.version = existing.version + 1;
    }

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const invitation = await tx.invitationTemplate.update({
        where: { id },
        data,
        select: INVITATION_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_INVITATION_TEMPLATE',
          details:
            `Updated invitation template ${existing.slug}` +
            (data.version !== undefined && data.version > existing.version
              ? ` (auto-bumped to v${data.version})`
              : ''),
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
          result: 'SUCCESS',
          targetType: 'INVITATION_TEMPLATE',
          targetResourceId: existing.id,
        },
      });
      return invitation;
    });

    invalidateInvitationRegistryCache();
    return NextResponse.json({ invitation: updated });
  } catch (error) {
    logger.error('Update invitation template error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    const existing = await db.invitationTemplate.findUnique({
      where: { id },
      select: { id: true, slug: true, isBuiltIn: true, isLocked: true },
    });
    if (!existing) return notFound('Modèle d\'invitation introuvable');

    if (existing.isBuiltIn) {
      return NextResponse.json(
        {
          error:
            'Les modèles d\'invitation intégrés ne peuvent pas être supprimés',
        },
        { status: 409 },
      );
    }

    if (existing.isLocked) {
      return lockedResponse();
    }

    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      await tx.invitationTemplate.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'DELETE_INVITATION_TEMPLATE',
          details: `Deleted invitation template ${existing.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
          result: 'SUCCESS',
          targetType: 'INVITATION_TEMPLATE',
          targetResourceId: existing.id,
        },
      });
    });

    invalidateInvitationRegistryCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('Delete invitation template error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PUT = withRateLimit(30, 60_000)(putHandler);
export const DELETE = withRateLimit(20, 60_000)(deleteHandler);

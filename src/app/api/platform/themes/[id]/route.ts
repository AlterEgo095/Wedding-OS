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
 * GET    /api/platform/themes/[id]            — fetch one theme (full detail).
 * PUT    /api/platform/themes/[id]            — update a theme (bumps version
 *                                                 automatically when palette,
 *                                                 fonts, identity, or config
 *                                                 change).
 * DELETE /api/platform/themes/[id]            — delete (blocks isBuiltIn).
 *
 * MISSION 5.9.2 P1 — extended THEME_SELECT to expose P0+P1 fields, and PUT
 * now accepts all new fields. Version is auto-bumped on substantive edits to
 * preserve the snapshot-ability invariant (audit 5.9.1 P1-5).
 *
 * MISSION 5.9.2 P3-A — Task 2 (lock enforcement):
 *   • THEME_SELECT extended with isLocked/lockedAt/lockedBy/approvalStatus/
 *     approvedAt/approvedBy so clients can render lock + workflow badges.
 *   • PUT handler returns 423 Locked if theme.isLocked is true (the dedicated
 *     /lock + /unlock + /transition endpoints are the only way to mutate a
 *     locked theme — direct edits are blocked).
 *   • DELETE handler returns 423 Locked if theme.isLocked is true.
 *   • updateThemeSchema now accepts `approvalStatus` as an optional field for
 *     direct API edits (the /transition endpoint is the preferred path, but
 *     exposing the field here lets the API be self-contained).
 */

const THEME_SELECT = {
  id: true,
  name: true,
  slug: true,
  paletteJson: true,
  fontDisplay: true,
  fontBody: true,
  isBuiltIn: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  // P0/P1 fields
  isPremium: true,
  isRecommended: true,
  isDefault: true,
  tier: true,
  category: true,
  version: true,
  identity: true,
  configJson: true,
      assetsJson: true,
  // P3-A — lock + approval workflow audit fields
  isLocked: true,
  lockedAt: true,
  lockedBy: true,
  approvalStatus: true,
  approvedAt: true,
  approvedBy: true,
} as const;

const updateThemeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  paletteJson: z.string().max(50_000).optional(),
  fontDisplay: z.string().max(200).nullable().optional(),
  fontBody: z.string().max(200).nullable().optional(),
  isBuiltIn: z.boolean().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  isPremium: z.boolean().optional(),
  isRecommended: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  tier: z.enum(['FREE', 'STANDARD', 'PREMIUM', 'EXCLUSIVE']).optional(),
  category: z.string().max(120).nullable().optional(),
  version: z.string().max(40).optional(),
  identity: z.string().max(120).nullable().optional(),
  configJson: z.string().max(200_000).optional(),
  // P3-A — direct API edits accept the workflow status. The preferred path is
  // POST /api/platform/themes/[id]/transition (which enforces the transition
  // matrix + sets the audit side-effects), but exposing the field here lets
  // scripts/migrations bypass the workflow if needed. Locked themes cannot be
  // mutated regardless of which field is being changed (423 guard above).
  approvalStatus: z
    .enum(['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'LOCKED'])
    .optional(),
});

function bumpVersion(current: string): string {
  // Patch-level bump: 1.0.0 → 1.0.1, 1.2.3 → 1.2.4
  const parts = current.split('.');
  if (parts.length !== 3) return '1.0.0';
  const major = parseInt(parts[0], 10) || 0;
  const minor = parseInt(parts[1], 10) || 0;
  const patch = parseInt(parts[2], 10) || 0;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * 423 Locked response — locked themes cannot be edited or deleted. The
 * canonical French copy guides the admin to the unlock endpoint.
 */
function lockedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Thème verrouillé — déverrouillez-le avant de le modifier' },
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
    const theme = await db.platformTheme.findUnique({
      where: { id },
      select: THEME_SELECT,
    });
    if (!theme) return notFound('Thème introuvable');
    return NextResponse.json({ theme });
  } catch (error) {
    logger.error('Get theme error', {
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

    const parsed = updateThemeSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }

    const existing = await db.platformTheme.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        version: true,
        // P3-A — fetch the lock state to enforce the 423 guard.
        isLocked: true,
      },
    });
    if (!existing) return notFound('Thème introuvable');

    // P3-A — Task 2: locked themes cannot be mutated via PUT.
    if (existing.isLocked) {
      return lockedResponse();
    }

    // Auto-bump version on substantive edits (palette/fonts/identity/config).
    // Metadata-only edits (isPremium, isRecommended, isDefault, status, tier,
    // category, name) don't bump — they describe the theme in the catalog but
    // don't change what gets rendered.
    const data = parsed.data;
    const isSubstantive =
      data.paletteJson !== undefined ||
      data.fontDisplay !== undefined ||
      data.fontBody !== undefined ||
      data.identity !== undefined ||
      data.configJson !== undefined;
    if (isSubstantive && data.version === undefined) {
      data.version = bumpVersion(existing.version);
    }

    const client = getClientInfo(request);
    const updated = await db.$transaction(async (tx) => {
      const theme = await tx.platformTheme.update({
        where: { id },
        data,
        select: THEME_SELECT,
      });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'UPDATE_THEME',
          details: `Updated theme ${existing.slug}` +
            (isSubstantive ? ` (auto-bumped to v${theme.version})` : ''),
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
      return theme;
    });

    return NextResponse.json({ theme: updated });
  } catch (error) {
    logger.error('Update theme error', {
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
    const existing = await db.platformTheme.findUnique({
      where: { id },
      select: { id: true, slug: true, isBuiltIn: true, isLocked: true },
    });
    if (!existing) return notFound('Thème introuvable');

    if (existing.isBuiltIn) {
      return NextResponse.json(
        { error: 'Les thèmes intégrés ne peuvent pas être supprimés' },
        { status: 409 },
      );
    }

    // P3-A — Task 2: locked themes cannot be deleted.
    if (existing.isLocked) {
      return lockedResponse();
    }

    const client = getClientInfo(request);
    await db.$transaction(async (tx) => {
      await tx.platformTheme.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'DELETE_THEME',
          details: `Deleted theme ${existing.slug}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('Delete theme error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PUT = withRateLimit(30, 60_000)(putHandler);
export const DELETE = withRateLimit(20, 60_000)(deleteHandler);

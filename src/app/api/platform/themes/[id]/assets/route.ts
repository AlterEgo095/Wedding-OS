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
 * PATCH /api/platform/themes/[id]/assets
 *
 * Update a PlatformTheme's `assetsJson` field (background + pattern image URLs).
 *
 * MISSION 5.9.2 P4-5 — Theme asset management.
 *
 * The Super Admin can attach a background image and/or a pattern image to a
 * theme so couples get a visually complete theme out of the box (no need to
 * hand-pick stock photos). The assets are surfaced on the wedding frontend via
 * the `--theme-background-image` + `--theme-pattern-image` CSS custom
 * properties (see src/components/wedding/ThemeInjector.tsx).
 *
 * Body (all optional — only provided keys are merged):
 *   {
 *     background: { url: string, alt?: string } | null,   // null = remove bg
 *     pattern:   { url: string, repeat?: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat' } | null
 *   }
 *
 * Behaviour:
 *   - The provided `background` / `pattern` keys are MERGED into the existing
 *     assetsJson (so callers can update one without re-sending the other).
 *   - Passing `null` for a key REMOVES it from the JSON.
 *   - URLs must be http(s)://, data:image/..., or root-relative paths.
 *
 * Auth: PLATFORM_ADMIN only (super admin).
 * CSRF: X-CSRF-Token header (validated by the auth middleware — all
 *       /api/platform/* mutations require it).
 * Rate limit: 10 req/min (assets don't change often — stricter than the
 *             30 req/min lock/unlock endpoints).
 *
 * Lock enforcement (P3-A consistency): if `theme.isLocked === true`, returns
 * 423 Locked. Locked themes are commercially frozen — assets can't change
 * until the theme is unlocked (POST /api/platform/themes/[id]/unlock).
 */

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const urlSchema = z
  .string()
  .max(10_000)
  .refine(
    (v) =>
      /^https?:\/\//i.test(v) ||
      /^data:image\//i.test(v) ||
      v.startsWith('/'),
    'URL invalide — doit commencer par http(s)://, data:image/ ou /',
  );

const backgroundSchema = z.object({
  url: urlSchema,
  alt: z.string().max(500).optional(),
});

const patternRepeatSchema = z.enum([
  'repeat',
  'repeat-x',
  'repeat-y',
  'no-repeat',
]);

const patternSchema = z.object({
  url: urlSchema,
  repeat: patternRepeatSchema.optional(),
});

const assetsBodySchema = z
  .object({
    background: backgroundSchema.nullable().optional(),
    pattern: patternSchema.nullable().optional(),
  })
  .refine(
    (v) => v.background !== undefined || v.pattern !== undefined,
    'Aucun champ à mettre à jour (fournir background ou pattern)',
  );

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Safely parse the stored assetsJson. Falls back to `{}` for missing/invalid
 * JSON so we never throw on a corrupted row (defensive — the seed always
 * writes valid JSON but old rows may predate the field).
 */
function parseAssetsJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Build the new assetsJson by merging the patch into the existing object.
 * `null` for a key removes it; `undefined` means "leave unchanged".
 */
function mergeAssets(
  current: Record<string, unknown>,
  patch: z.infer<typeof assetsBodySchema>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  if (patch.background === null) {
    delete next.background;
  } else if (patch.background) {
    const bg: Record<string, unknown> = { url: patch.background.url };
    if (patch.background.alt !== undefined && patch.background.alt !== '') {
      bg.alt = patch.background.alt;
    } else if ('alt' in bg) {
      // Defensive: if a previously-stored alt is now empty, drop it.
      delete bg.alt;
    }
    next.background = bg;
  }
  if (patch.pattern === null) {
    delete next.pattern;
  } else if (patch.pattern) {
    const pat: Record<string, unknown> = { url: patch.pattern.url };
    // Default to 'repeat' when not provided (CSS default for background-repeat).
    pat.repeat = patch.pattern.repeat ?? 'repeat';
    next.pattern = pat;
  }
  return next;
}

/**
 * 423 Locked — canonical French copy shared with the PUT/DELETE themes/[id]
 * route (P3-A Task 2). Locked themes cannot have their assets changed.
 */
function lockedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Thème verrouillé — déverrouillez-le avant de modifier les assets' },
    { status: 423 },
  );
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function patchAssetsHandler(
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

    const parsed = assetsBodySchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
    }

    // Fetch existing to confirm existence + capture pre-state for audit +
    // enforce the P3-A lock guard.
    const existing = await db.platformTheme.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        isLocked: true,
        assetsJson: true,
      },
    });
    if (!existing) return notFound('Thème introuvable');

    // P3-A consistency — locked themes cannot have assets mutated.
    if (existing.isLocked) {
      return lockedResponse();
    }

    const currentAssets = parseAssetsJson(existing.assetsJson);
    const nextAssets = mergeAssets(currentAssets, parsed.data);
    const nextAssetsJson = JSON.stringify(nextAssets);

    const client = getClientInfo(request);

    const updated = await db.$transaction(async (tx) => {
      const theme = await tx.platformTheme.update({
        where: { id },
        data: { assetsJson: nextAssetsJson },
        select: { id: true, slug: true, assetsJson: true },
      });

      // Build a human-readable summary of what changed (for the audit log).
      const changes: string[] = [];
      if (parsed.data.background === null) {
        changes.push('background cleared');
      } else if (parsed.data.background) {
        changes.push(`background url=${parsed.data.background.url.substring(0, 80)}`);
      }
      if (parsed.data.pattern === null) {
        changes.push('pattern cleared');
      } else if (parsed.data.pattern) {
        changes.push(
          `pattern url=${parsed.data.pattern.url.substring(0, 80)} repeat=${parsed.data.pattern.repeat ?? 'repeat'}`,
        );
      }
      const summary = changes.length ? changes.join(' | ') : 'no-op';

      await tx.auditLog.create({
        data: {
          weddingId: null,
          userId: user!.id,
          action: 'THEME_ASSET_UPDATE',
          details: `Updated assets for theme ${existing.slug} — ${summary}`,
          ipAddress: client.ipAddress ?? null,
          userAgent: client.userAgent ?? null,
          // P5.2 enrichment fields
          targetResourceId: existing.id,
          targetType: 'THEME',
          result: 'SUCCESS',
        },
      });

      return theme;
    });

    return NextResponse.json({ theme: updated });
  } catch (error) {
    logger.error('Patch theme assets error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

export const PATCH = withRateLimit(10, 60_000)(patchAssetsHandler);

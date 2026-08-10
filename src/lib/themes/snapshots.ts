// ══════════════════════════════════════════════════════════════════════════════
// src/lib/themes/snapshots.ts
// MISSION 5.9.2 P1 — PlatformTheme snapshot system.
// ══════════════════════════════════════════════════════════════════════════════
//
// Provides immutable publish-time snapshots of PlatformTheme rows. A snapshot
// freezes ALL theme fields at the moment of publish so that already-published
// weddings keep rendering with their original theme version, even if the live
// PlatformTheme is later edited (audit 5.9.1 P1-5 fix).
//
// Public API:
//   - createThemeSnapshot(platformThemeId, triggeredBy?) → PlatformThemeSnapshot
//   - getThemeSnapshot(snapshotId) → PlatformThemeSnapshot | null
//   - listThemeSnapshots(platformThemeId) → PlatformThemeSnapshot[]
//   - snapshotForWedding(weddingId) → PlatformThemeSnapshot | null
//       (resolves the snapshot currently pinned to a Wedding)
//   - publishWeddingTheme(weddingId, triggeredBy?) → PlatformThemeSnapshot
//       (creates a snapshot of the Wedding's current theme + pins it)
//
// All write operations are audited via AuditLog.
// ══════════════════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThemeSnapshotResult {
  id: string;
  platformThemeId: string | null;
  themeSlug: string;
  version: string;
  name: string;
  createdAt: Date;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create an immutable snapshot of a PlatformTheme's current state.
 *
 * The snapshot copies ALL theme fields at the moment of creation — subsequent
 * edits to the live PlatformTheme do NOT propagate to existing snapshots.
 *
 * @param platformThemeId  The PlatformTheme to snapshot.
 * @param triggeredBy      Optional admin user ID (for the audit trail).
 * @returns                The created PlatformThemeSnapshot.
 * @throws                 If the PlatformTheme is not found.
 */
export async function createThemeSnapshot(
  platformThemeId: string,
  triggeredBy?: string | null,
): Promise<ThemeSnapshotResult> {
  const theme = await db.platformTheme.findUnique({
    where: { id: platformThemeId },
    select: {
      id: true,
      slug: true,
      name: true,
      version: true,
      paletteJson: true,
      fontDisplay: true,
      fontBody: true,
      isPremium: true,
      isRecommended: true,
      isDefault: true,
      tier: true,
      category: true,
      identity: true,
      configJson: true,
    },
  });

  if (!theme) {
    throw new Error(`[snapshots] PlatformTheme not found: ${platformThemeId}`);
  }

  const snapshot = await db.platformThemeSnapshot.create({
    data: {
      platformThemeId: theme.id,
      themeSlug: theme.slug,
      version: theme.version,
      name: theme.name,
      paletteJson: theme.paletteJson,
      fontDisplay: theme.fontDisplay,
      fontBody: theme.fontBody,
      isPremium: theme.isPremium,
      isRecommended: theme.isRecommended,
      isDefault: theme.isDefault,
      tier: theme.tier,
      category: theme.category,
      identity: theme.identity,
      configJson: theme.configJson,
      triggeredBy: triggeredBy ?? null,
    },
    select: {
      id: true,
      platformThemeId: true,
      themeSlug: true,
      version: true,
      name: true,
      createdAt: true,
    },
  });

  logger.info('Theme snapshot created', {
    platformThemeId: theme.id,
    themeSlug: theme.slug,
    snapshotId: snapshot.id,
    version: snapshot.version,
    triggeredBy: triggeredBy ?? null,
  });

  return snapshot;
}

/**
 * Fetch a snapshot by ID. Returns null if not found.
 */
export async function getThemeSnapshot(
  snapshotId: string,
): Promise<ThemeSnapshotResult | null> {
  const snapshot = await db.platformThemeSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      id: true,
      platformThemeId: true,
      themeSlug: true,
      version: true,
      name: true,
      createdAt: true,
    },
  });
  return snapshot;
}

/**
 * List all snapshots for a PlatformTheme, newest first.
 */
export async function listThemeSnapshots(
  platformThemeId: string,
): Promise<ThemeSnapshotResult[]> {
  return db.platformThemeSnapshot.findMany({
    where: { platformThemeId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      platformThemeId: true,
      themeSlug: true,
      version: true,
      name: true,
      createdAt: true,
    },
  });
}

/**
 * Resolve the snapshot currently pinned to a Wedding.
 * Returns null if the Wedding has no pinned snapshot (legacy or unpublished).
 */
export async function snapshotForWedding(
  weddingId: string,
): Promise<ThemeSnapshotResult | null> {
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: {
      themeSnapshotId: true,
      themeSnapshot: {
        select: {
          id: true,
          platformThemeId: true,
          themeSlug: true,
          version: true,
          name: true,
          createdAt: true,
        },
      },
    },
  });
  if (!wedding || !wedding.themeSnapshot) return null;
  return wedding.themeSnapshot;
}

/**
 * Publish-time helper: creates a snapshot of the Wedding's currently-applied
 * PlatformTheme and pins it to the Wedding via `themeSnapshotId`.
 *
 * Lookup order:
 *   1. If the Wedding's Collection has a `themeId` → snapshot that PlatformTheme.
 *   2. Else if the Wedding has a Theme row with customizations.identity set →
 *      snapshot the PlatformTheme matching that identity slug.
 *   3. Else → no-op (return null). The Wedding will keep rendering with the
 *      live theme (legacy behavior, zero regression).
 *
 * @param weddingId    The Wedding being published.
 * @param triggeredBy  Optional admin user ID (audit trail).
 * @returns            The created snapshot, or null if no PlatformTheme could
 *                     be resolved for this Wedding.
 */
export async function publishWeddingTheme(
  weddingId: string,
  triggeredBy?: string | null,
): Promise<ThemeSnapshotResult | null> {
  // Step 1 — try Collection.themeId
  const wedding = await db.wedding.findUnique({
    where: { id: weddingId },
    select: {
      id: true,
      slug: true,
      collectionId: true,
      collection: { select: { themeId: true } },
      theme: { select: { customizations: true } },
    },
  });

  if (!wedding) {
    throw new Error(`[snapshots] Wedding not found: ${weddingId}`);
  }

  let platformThemeId: string | null = wedding.collection?.themeId ?? null;

  // Step 2 — fall back to identity slug from Theme.customizations
  if (!platformThemeId && wedding.theme?.customizations) {
    try {
      const customizations = JSON.parse(wedding.theme.customizations) as {
        identity?: string;
      };
      if (customizations.identity) {
        const identityTheme = await db.platformTheme.findUnique({
          where: { slug: customizations.identity },
          select: { id: true },
        });
        if (identityTheme) {
          platformThemeId = identityTheme.id;
        }
      }
    } catch {
      // customizations is not valid JSON — fall through to no-op
    }
  }

  if (!platformThemeId) {
    logger.info('No PlatformTheme to snapshot for wedding — skipping', {
      weddingId,
      weddingSlug: wedding.slug,
    });
    return null;
  }

  // Step 3 — create the snapshot + pin it to the Wedding in a single transaction
  const snapshot = await db.$transaction(async (tx) => {
    const theme = await tx.platformTheme.findUnique({
      where: { id: platformThemeId! },
      select: {
        id: true, slug: true, name: true, version: true,
        paletteJson: true, fontDisplay: true, fontBody: true,
        isPremium: true, isRecommended: true, isDefault: true,
        tier: true, category: true, identity: true, configJson: true,
      },
    });
    if (!theme) {
      throw new Error(`[snapshots] PlatformTheme not found: ${platformThemeId}`);
    }

    const created = await tx.platformThemeSnapshot.create({
      data: {
        platformThemeId: theme.id,
        themeSlug: theme.slug,
        version: theme.version,
        name: theme.name,
        paletteJson: theme.paletteJson,
        fontDisplay: theme.fontDisplay,
        fontBody: theme.fontBody,
        isPremium: theme.isPremium,
        isRecommended: theme.isRecommended,
        isDefault: theme.isDefault,
        tier: theme.tier,
        category: theme.category,
        identity: theme.identity,
        configJson: theme.configJson,
        triggeredBy: triggeredBy ?? null,
      },
    });

    await tx.wedding.update({
      where: { id: weddingId },
      data: { themeSnapshotId: created.id },
    });

    await tx.auditLog.create({
      data: {
        weddingId,
        userId: triggeredBy ?? null,
        action: 'PUBLISH_THEME_SNAPSHOT',
        details: `Snapshot ${created.id} (theme=${theme.slug} v${theme.version}) pinned to wedding ${wedding.slug}`,
      },
    });

    return created;
  });

  logger.info('Wedding theme snapshot published', {
    weddingId,
    weddingSlug: wedding.slug,
    snapshotId: snapshot.id,
    themeSlug: snapshot.themeSlug,
    version: snapshot.version,
  });

  return {
    id: snapshot.id,
    platformThemeId: snapshot.platformThemeId,
    themeSlug: snapshot.themeSlug,
    version: snapshot.version,
    name: snapshot.name,
    createdAt: snapshot.createdAt,
  };
}

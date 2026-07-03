export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { isValidSlug, buildCoupleLabel } from '@/lib/types';
import { invalidateWeddingCache } from '@/lib/tenant-context';
// P2-CQ-7: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
import { internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

/**
 * Wedding duplication endpoint (Phase 3 ÉTAPE 5 — commercial optimization).
 *
 * POST /api/platform/weddings/{id}/duplicate
 *   Body: { newSlug: string, newBrideName?: string, newGroomName?: string }
 *   Response: { wedding: { id, slug, coupleLabel, status } }
 *
 * Creates a brand-new DRAFT wedding that is a copy of the source wedding's
 * configuration (settings, theme, music, timeline, couple story). It does
 * NOT copy guest data, tables, access logs, audit logs, media files, or
 * subscriptions — those are wedding-specific and must be re-created by the
 * couple. The new wedding is always created in DRAFT status with the TRIAL
 * plan (the commercial team can upgrade it via the billing tab).
 *
 * Platform-admin only — uses raw `db` (cross-tenant operation by nature).
 *
 * P1-CQ-17: all 6 duplicable writes (wedding + settings + theme + music +
 * timeline + couple story) are wrapped in a single `db.$transaction` — if
 * any one fails (slug race, partial copy error), the whole duplication is
 * rolled back. No orphan settings/theme rows left behind.
 *
 * P2-CQ-7: the audit-log write happens AFTER the tx commits, via
 * writeAuditLog (best-effort — never crashes the user request, populates
 * ipAddress/userAgent from the request automatically).
 */

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  let sourceWeddingId: string | null = null;
  let normalizedSlug: string | null = null;
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;
    sourceWeddingId = id;

    // ─── 1. Fetch the source wedding with all duplicable relations ───────────
    const source = await db.wedding.findUnique({
      where: { id },
      include: {
        settings: true,
        theme: true,
        music: true,
        timeline: true,
        stories: true,
      },
    });

    if (!source) {
      return NextResponse.json(
        { error: 'Source wedding not found' },
        { status: 404 }
      );
    }

    // ─── 2. Validate the request body ────────────────────────────────────────
    const body = await request.json().catch(() => ({}));
    const { newSlug, newBrideName, newGroomName } = body as {
      newSlug?: string;
      newBrideName?: string;
      newGroomName?: string;
    };

    if (!newSlug || typeof newSlug !== 'string') {
      return NextResponse.json(
        { error: 'newSlug is required' },
        { status: 400 }
      );
    }

    normalizedSlug = newSlug.toLowerCase().trim();
    if (!isValidSlug(normalizedSlug)) {
      return NextResponse.json(
        {
          error:
            'Invalid slug. Use 3-32 lowercase alphanumeric characters or hyphens. Reserved words are not allowed.',
        },
        { status: 400 }
      );
    }

    // ─── 3. Slug uniqueness check ────────────────────────────────────────────
    const existing = await db.wedding.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Wedding with slug "${normalizedSlug}" already exists` },
        { status: 409 }
      );
    }

    // ─── 4. Resolve final bride/groom names (fall back to source) ────────────
    const brideName =
      typeof newBrideName === 'string' && newBrideName.trim()
        ? newBrideName.trim()
        : source.brideName;
    const groomName =
      typeof newGroomName === 'string' && newGroomName.trim()
        ? newGroomName.trim()
        : source.groomName;
    const coupleLabel = buildCoupleLabel(brideName, groomName);

    // ─── 5–10. Create the new wedding + copy all relations IN A TRANSACTION ─
    // P1-CQ-17: all 6 duplicable writes (wedding + settings + theme + music +
    // timeline + stories) are wrapped in a single $transaction. If any one
    // fails (e.g. slug race, partial copy error), the whole duplication is
    // rolled back — no orphan settings/theme rows left behind.
    const slugForAudit = normalizedSlug;
    const sourceSlugForAudit = source.slug;
    const createdById = user!.id;
    const newWedding = await db.$transaction(async (tx) => {
      // ─── 5. Create the new wedding (DRAFT + TRIAL) ───────────────────────
      // We copy the venue info + timezone so the couple gets a turn-key draft,
      // but never the status, plan, isDefault, customDomain, or publishedAt.
      const created = await tx.wedding.create({
        data: {
          slug: slugForAudit,
          brideName,
          groomName,
          coupleLabel,
          weddingDate: source.weddingDate,
          timezone: source.timezone,
          venueName: source.venueName,
          venueAddress: source.venueAddress,
          venueCity: source.venueCity,
          venueLat: source.venueLat,
          venueLng: source.venueLng,
          venueReference: source.venueReference,
          status: 'DRAFT',
          plan: 'TRIAL',
          isDefault: false,
          publishedAt: null,
        },
        select: {
          id: true,
          slug: true,
          coupleLabel: true,
          status: true,
        },
      });

      // ─── 6. Copy Settings (key/value pairs) ──────────────────────────────
      if (source.settings.length > 0) {
        await tx.settings.createMany({
          data: source.settings.map((s) => ({
            weddingId: created.id,
            key: s.key,
            value: s.value,
          })),
        });
      }

      // ─── 7. Copy Theme (1:1 relation) ────────────────────────────────────
      if (source.theme) {
        await tx.theme.create({
          data: {
            weddingId: created.id,
            primaryColor: source.theme.primaryColor,
            accentColor: source.theme.accentColor,
            fontDisplay: source.theme.fontDisplay,
            fontBody: source.theme.fontBody,
            layout: source.theme.layout,
            customizations: source.theme.customizations,
          },
        });
      }

      // ─── 8. Copy MusicTrack (1:1; file NOT copied — points to source URL) ─
      // The new wedding references the source's music URL; the couple can
      // upload their own later. We do NOT copy the underlying file (it lives
      // in /uploads/<source-slug>/ — re-using the URL is safe + storage-
      // efficient).
      if (source.music) {
        await tx.musicTrack.create({
          data: {
            weddingId: created.id,
            storageProvider: source.music.storageProvider,
            storageKey: source.music.storageKey,
            url: source.music.url,
            title: source.music.title,
            volume: source.music.volume,
            enabled: false, // disabled by default — couple must re-enable
            autoplay: false,
          },
        });
      }

      // ─── 9. Copy EventTimeline ───────────────────────────────────────────
      if (source.timeline.length > 0) {
        await tx.eventTimeline.createMany({
          data: source.timeline.map((t) => ({
            weddingId: created.id,
            time: t.time,
            activity: t.activity,
            location: t.location,
            description: t.description,
            icon: t.icon,
            order: t.order,
          })),
        });
      }

      // ─── 10. Copy CoupleStory (text + image URLs — files NOT copied) ─────
      // Image URLs point to /uploads/<source-slug>/...; they remain
      // accessible because the source wedding still owns those files. The
      // couple can upload their own images later via the media manager.
      if (source.stories.length > 0) {
        await tx.coupleStory.createMany({
          data: source.stories.map((s) => ({
            weddingId: created.id,
            title: s.title,
            description: s.description,
            date: s.date,
            imageUrl: s.imageUrl,
            order: s.order,
          })),
        });
      }

      return created;
    });

    // ─── 11. Audit log (platform-level — weddingId stays null) ─────────────
    // P2-CQ-7: writeAuditLog AFTER the tx commits so a failed audit write
    // (e.g. DB issue) does NOT roll back the duplication. Best-effort —
    // never throws. IP/UA auto-derived from `request`.
    await writeAuditLog({
      weddingId: null, // platform-level event
      userId: createdById,
      action: 'DUPLICATE_WEDDING',
      details: `Duplicated wedding ${sourceSlugForAudit} → ${slugForAudit} (new id: ${newWedding.id})`,
      request,
    });

    // No cache to invalidate (new wedding has never been queried), but call
    // for safety in case a future code path warms the cache during creation.
    invalidateWeddingCache(slugForAudit);

    return NextResponse.json({ wedding: newWedding }, { status: 201 });
  } catch (error) {
    logger.error('duplicate-wedding failed', {
      err: error,
      sourceWeddingId,
      normalizedSlug,
    });
    return internalError();
  }
}

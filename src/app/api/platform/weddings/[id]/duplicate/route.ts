export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { isValidSlug, buildCoupleLabel } from '@/lib/types';
import { invalidateWeddingCache } from '@/lib/tenant-context';

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
 */

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

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

    const normalizedSlug = newSlug.toLowerCase().trim();
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

    // ─── 5. Create the new wedding (DRAFT + TRIAL) ───────────────────────────
    // We copy the venue info + timezone so the couple gets a turn-key draft,
    // but never the status, plan, isDefault, customDomain, or publishedAt.
    const newWedding = await db.wedding.create({
      data: {
        slug: normalizedSlug,
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

    // ─── 6. Copy Settings (key/value pairs) ──────────────────────────────────
    if (source.settings.length > 0) {
      await db.settings.createMany({
        data: source.settings.map((s) => ({
          weddingId: newWedding.id,
          key: s.key,
          value: s.value,
        })),
      });
    }

    // ─── 7. Copy Theme (1:1 relation) ────────────────────────────────────────
    // Collection Engine patch: clear the Penpot file reference + collectionMeta
    // in the copied customizations so the new wedding doesn't point to the
    // source wedding's Penpot master file (data-leak fix). The luxury preset
    // is preserved (it's a transferable ambiance config, not wedding-specific).
    // The new wedding's collectionId stays null — the couple re-chooses a
    // Collection via the Collections tab.
    if (source.theme) {
      let sanitizedCustomizations: string | null = source.theme.customizations;
      if (sanitizedCustomizations) {
        try {
          const parsed = JSON.parse(sanitizedCustomizations) as Record<string, unknown>;
          // Clear Penpot file reference (keep tokens — they're cosmetic)
          if (parsed.penpot && typeof parsed.penpot === 'object') {
            const penpot = { ...(parsed.penpot as Record<string, unknown>) };
            delete penpot.fileUrl;
            delete penpot.fileId;
            delete penpot.pageId;
            delete penpot.lastSyncedAt;
            parsed.penpot = penpot;
          }
          // Clear collectionMeta (the new wedding is not linked to a Collection yet)
          delete parsed.collectionMeta;
          sanitizedCustomizations = JSON.stringify(parsed);
        } catch {
          // If parsing fails, keep the original (defensive — don't block duplicate)
        }
      }
      await db.theme.create({
        data: {
          weddingId: newWedding.id,
          primaryColor: source.theme.primaryColor,
          accentColor: source.theme.accentColor,
          fontDisplay: source.theme.fontDisplay,
          fontBody: source.theme.fontBody,
          layout: source.theme.layout,
          customizations: sanitizedCustomizations,
        },
      });
    }

    // ─── 8. Copy MusicTrack (1:1 relation, file NOT copied — points to source URL) ─
    // The new wedding references the source's music URL; the couple can upload
    // their own later. We do NOT copy the underlying file (it lives in
    // /uploads/<source-slug>/ — re-using the URL is safe + storage-efficient).
    if (source.music) {
      await db.musicTrack.create({
        data: {
          weddingId: newWedding.id,
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

    // ─── 9. Copy EventTimeline ───────────────────────────────────────────────
    if (source.timeline.length > 0) {
      await db.eventTimeline.createMany({
        data: source.timeline.map((t) => ({
          weddingId: newWedding.id,
          time: t.time,
          activity: t.activity,
          location: t.location,
          description: t.description,
          icon: t.icon,
          order: t.order,
        })),
      });
    }

    // ─── 10. Copy CoupleStory (text + image URLs — image files NOT copied) ───
    // Image URLs point to /uploads/<source-slug>/...; they remain accessible
    // because the source wedding still owns those files. The couple can upload
    // their own images later via the media manager.
    if (source.stories.length > 0) {
      await db.coupleStory.createMany({
        data: source.stories.map((s) => ({
          weddingId: newWedding.id,
          title: s.title,
          description: s.description,
          date: s.date,
          imageUrl: s.imageUrl,
          order: s.order,
        })),
      });
    }

    // ─── 11. Audit log ──────────────────────────────────────────────────────
    await db.auditLog.create({
      data: {
        weddingId: null, // platform-level event
        userId: user!.id,
        action: 'DUPLICATE_WEDDING',
        details: `Duplicated wedding ${source.slug} → ${normalizedSlug} (new id: ${newWedding.id})`,
      },
    });

    // No cache to invalidate (new wedding has never been queried), but call
    // for safety in case a future code path warms the cache during creation.
    invalidateWeddingCache(normalizedSlug);

    return NextResponse.json({ wedding: newWedding }, { status: 201 });
  } catch (error) {
    console.error('Duplicate wedding error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

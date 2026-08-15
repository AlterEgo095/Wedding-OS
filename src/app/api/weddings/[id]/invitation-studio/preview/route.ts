// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/invitation-studio/preview — MISSION 5.9.2-B/C
// ══════════════════════════════════════════════════════════════════════════════
// Live preview endpoint — composes an InvitationExperienceConfig on-the-fly from
// DRAFT inputs (templateId + mediaSlotsJson + invitationConfigJson) WITHOUT
// publishing. This lets the operator see the exact premium invitation result
// before committing to a publish.
//
// POST /api/weddings/[id]/invitation-studio/preview
//   Body: { templateId?, mediaSlotsJson?, invitationConfigJson? }
//   → { experience: InvitationExperienceConfig }
//
// If a field is omitted, the current saved value on the wedding is used.
// The returned `experience` is passed directly to <IdentityInvitation config={...} />
// in the admin UI for WYSIWYG rendering.
//
// This REUSES composeInvitationExperience (lib/invitations/index.ts) — the same
// function the deployment pipeline uses at publish time. The only difference is
// we skip the snapshot creation + publishedConfigJson update (preview only).
//
// Auth: PLATFORM_ADMIN or ORGANIZER. Tenant-scoped.
// ══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccessAsync } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { badRequest, internalError } from '@/lib/api-errors';
import { safeJsonParse } from '@/lib/safe-json';
import {
  composeInvitationExperience,
  getInvitationTemplateById,
  getDefaultInvitationTemplate,
} from '@/lib/invitations';
import type {
  InvitationExperienceContext,
  InvitationMediaAsset,
  InvitationEventContext,
  InvitationStoryEntry,
  InvitationTemplateOverrides,
} from '@/lib/invitations/types';

async function checkAuth(request: NextRequest, weddingId: string) {
  const user = await getAuthUser(request);
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!hasPermission(user.role, ['PLATFORM_ADMIN', 'ORGANIZER'])) {
    return { error: NextResponse.json({ error: 'Forbidden — ORGANIZER+ required' }, { status: 403 }) };
  }
  if (!(await assertWeddingAccessAsync(user, weddingId))) {
    return { error: NextResponse.json({ error: 'Forbidden — not your wedding' }, { status: 403 }) };
  }
  return { user };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const {
      templateId: overrideTemplateId,
      mediaSlotsJson: overrideMediaSlots,
      invitationConfigJson: overrideConfig,
    } = (body ?? {}) as {
      templateId?: string | null;
      mediaSlotsJson?: Record<string, { mediaId?: string; focalPoint?: { x: number; y: number } }>;
      invitationConfigJson?: Record<string, unknown>;
    };

    // ── 1. Load wedding data ──────────────────────────────────────────────────
    const w = await db.wedding.findUnique({
      where: { id: weddingId },
      select: {
        id: true,
        slug: true,
        brideName: true,
        groomName: true,
        coupleLabel: true,
        weddingDate: true,
        timezone: true,
        venueName: true,
        venueAddress: true,
        venueCity: true,
        venueLat: true,
        venueLng: true,
        invitationTemplateId: true,
        invitationConfigJson: true,
        mediaSlotsJson: true,
      },
    });

    if (!w) {
      return NextResponse.json({ error: 'Wedding not found' }, { status: 404 });
    }

    // ── 2. Resolve the template (override > wedding's > default) ──────────────
    let templateRow = null;
    const effectiveTemplateId = overrideTemplateId !== undefined
      ? overrideTemplateId
      : w.invitationTemplateId;

    if (effectiveTemplateId) {
      templateRow = await getInvitationTemplateById(effectiveTemplateId);
    }
    if (!templateRow) {
      templateRow = await getDefaultInvitationTemplate();
    }
    if (!templateRow) {
      return NextResponse.json(
        { error: 'Aucun template d\'invitation disponible' },
        { status: 404 },
      );
    }

    // ── 3. Resolve media slots (override > wedding's saved value) ─────────────
    const mediaSlotsRaw = safeJsonParse<
      Record<string, { mediaId?: string; focalPoint?: { x: number; y: number }; url?: string }>
    >(
      overrideMediaSlots !== undefined
        ? JSON.stringify(overrideMediaSlots)
        : (w.mediaSlotsJson ?? '{}'),
      {},
    );

    const mediaIds = Object.values(mediaSlotsRaw)
      .map((v) => v?.mediaId)
      .filter((m): m is string => typeof m === 'string' && m.length > 0);
    const mediaRows = mediaIds.length
      ? await db.media.findMany({
          where: { id: { in: mediaIds }, weddingId }, // tenant-scoped
          select: { id: true, url: true, title: true, aspectRatio: true, semanticRole: true, slotId: true },
        })
      : [];
    const mediaById = new Map(mediaRows.map((m) => [m.id, m]));
    const resolvedMediaSlots: Record<string, InvitationMediaAsset> = {};
    for (const [slotKey, slotVal] of Object.entries(mediaSlotsRaw)) {
      if (!slotVal?.mediaId) continue;
      const media = mediaById.get(slotVal.mediaId);
      if (!media) continue;
      resolvedMediaSlots[slotKey] = {
        mediaId: media.id,
        url: media.url,
        alt: media.title ?? null,
        aspectRatio: media.aspectRatio ?? null,
        ...(slotVal.focalPoint ? { focalPoint: slotVal.focalPoint } : {}),
      };
    }

    // ── 4. Fetch wedding events + stories (same as pipeline) ──────────────────
    const timelineRows = await db.eventTimeline.findMany({
      where: { weddingId },
      orderBy: { order: 'asc' },
      take: 50,
      select: { id: true, activity: true, time: true, location: true, description: true, icon: true },
    });
    const events: InvitationEventContext[] = timelineRows.map((r, i) => {
      const icon = (r.icon ?? '').toLowerCase();
      let type: InvitationEventContext['type'] = 'other';
      if (icon.includes('church') || icon.includes('ring') || i === 0) type = 'ceremony';
      else if (icon.includes('party') || icon.includes('dance')) type = 'party';
      else if (icon.includes('drink') || icon.includes('cocktail')) type = 'cocktail';
      else if (icon.includes('food') || icon.includes('dinner') || icon.includes('meal')) type = 'dinner';
      else if (icon.includes('receive')) type = 'reception';
      return {
        eventId: r.id,
        type,
        title: r.activity,
        startTime: r.time ?? null,
        endTime: null,
        location: r.location ?? null,
        address: null,
      };
    });

    const storyRows = await db.coupleStory.findMany({
      where: { weddingId },
      orderBy: { order: 'asc' },
      take: 20,
      select: { id: true, title: true, description: true, date: true, imageUrl: true },
    });
    const stories: InvitationStoryEntry[] = storyRows.map((r) => ({
      storyId: r.id,
      title: r.title,
      body: r.description,
      date: r.date ?? null,
      imageUrl: r.imageUrl ?? null,
    }));

    // ── 5. Build the InvitationExperienceContext ──────────────────────────────
    const overrides = safeJsonParse<InvitationTemplateOverrides>(
      overrideConfig !== undefined
        ? JSON.stringify(overrideConfig)
        : (w.invitationConfigJson ?? '{}'),
      {} as InvitationTemplateOverrides,
    );

    const slug = w.slug;
    const ctx: InvitationExperienceContext = {
      weddingId: w.id,
      weddingSlug: slug,
      coupleLabel: w.coupleLabel || `${w.brideName} & ${w.groomName}`.trim(),
      brideName: w.brideName,
      groomName: w.groomName,
      weddingDate: w.weddingDate ? w.weddingDate.toISOString() : null,
      timezone: w.timezone || 'Africa/Kinshasa',
      venueName: w.venueName ?? null,
      venueAddress: w.venueAddress ?? null,
      venueCity: w.venueCity ?? null,
      venueLat: w.venueLat ?? null,
      venueLng: w.venueLng ?? null,
      rsvpUrl: `/w/${slug}#rsvp`,
      galleryUrl: `/w/${slug}#gallery`,
      storyUrl: `/w/${slug}#story`,
      mapUrl:
        w.venueLat && w.venueLng
          ? `https://www.google.com/maps?q=${encodeURIComponent(w.venueLat)},${encodeURIComponent(w.venueLng)}`
          : null,
      mediaSlots: resolvedMediaSlots,
      guest: null,
      events,
      stories,
      overrides,
    };

    // ── 6. Compose the InvitationExperienceConfig ─────────────────────────────
    const experience = await composeInvitationExperience(templateRow.slug, ctx);

    return NextResponse.json({
      experience,
      templateSlug: templateRow.slug,
      templateName: templateRow.name,
      resolvedMediaSlotsCount: Object.keys(resolvedMediaSlots).length,
      sectionsCount: experience.sections.length,
      preview: true,
    });
  } catch (error) {
    logger.error('Invitation Studio preview error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

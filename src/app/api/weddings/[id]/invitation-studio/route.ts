// ══════════════════════════════════════════════════════════════════════════════
// /api/weddings/[id]/invitation-studio — MISSION 5.9.2-B/C
// ══════════════════════════════════════════════════════════════════════════════
// Per-wedding Invitation Studio API — the NO-CODE configuration layer that was
// missing from the 5.9.2 P3 engine. The backend composer + pipeline + renderers
// already exist and are REAL; this API is the operator-facing surface that lets
// an ORGANIZER choose a template, assign couple photos to semantic slots, and
// publish — all without SSH/SQL/code.
//
// GET  /api/weddings/[id]/invitation-studio
//   → { wedding: { invitationTemplateId, invitationConfigJson, mediaSlotsJson },
//       templates: InvitationTemplateSummary[],   // 15 PUBLISHED templates
//       media: Media[],                          // wedding's uploaded photos
//       currentTemplate: InvitationTemplateDetailed | null,
//       mediaSlotDeclarations: MediaSlot[]        // from current template config
//     }
//
// PUT  /api/weddings/[id]/invitation-studio
//   Body: { templateId?, mediaSlotsJson?, invitationConfigJson? }
//   → Saves DRAFT (no publish). Updates the 3 wedding fields. Invalidates cache.
//     The operator can iterate (change template, assign photos, tweak copy) and
//     preview via /preview before committing to a publish.
//
// POST /api/weddings/[id]/invitation-studio
//   → Publishes via publishWeddingViaPipeline() which runs the canonical
//     deployment pipeline (resolveInvitations → composeInvitationExperience →
//     snapshot → publishedConfigJson.invitation). The public page immediately
//     reflects the new invitation.
//
// Auth: PLATFORM_ADMIN or ORGANIZER. Tenant-scoped via assertWeddingAccessAsync.
// ══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission, assertWeddingAccessAsync } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { badRequest, internalError } from '@/lib/api-errors';
import { safeJsonParse } from '@/lib/safe-json';
import { invalidateWeddingCache } from '@/lib/wedding/cache';
import { publishWeddingViaPipeline } from '@/lib/pipeline/publish-helper';
import {
  getInvitationTemplateById,
  type InvitationTemplateDetailed,
} from '@/lib/invitations';
import type { MediaSlot } from '@/lib/invitations/types';

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

// ─── GET: current invitation config + template catalog + media ────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;

  try {
    // Fetch the wedding's invitation fields + basic info.
    const wedding = await db.wedding.findUnique({
      where: { id: weddingId },
      select: {
        id: true,
        slug: true,
        brideName: true,
        groomName: true,
        coupleLabel: true,
        weddingDate: true,
        venueName: true,
        venueCity: true,
        invitationTemplateId: true,
        invitationConfigJson: true,
        mediaSlotsJson: true,
        invitationSnapshotId: true,
        status: true,
      },
    });

    if (!wedding) {
      return NextResponse.json({ error: 'Wedding not found' }, { status: 404 });
    }

    // Fetch the full PUBLISHED template catalog (15 templates) with configJson
    // so we can extract media slot declarations for the UI card grid.
    const templateRows = await db.invitationTemplate.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true, slug: true, name: true, description: true,
        category: true, style: true, layout: true, identity: true,
        tier: true, status: true, isPremium: true, isRecommended: true,
        isDefault: true, isBuiltIn: true, version: true,
        thumbnailUrl: true, previewUrl: true, themeId: true,
        configJson: true,
      },
      orderBy: [{ isDefault: 'desc' }, { isRecommended: 'desc' }, { name: 'asc' }],
    });

    // Fetch the wedding's media (photos with semanticRole/slotId).
    const media = await db.media.findMany({
      where: { weddingId },
      select: {
        id: true,
        url: true,
        title: true,
        type: true,
        category: true,
        semanticRole: true,
        slotId: true,
        aspectRatio: true,
        sizeBytes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Resolve the currently assigned template (or the default).
    let currentTemplate: InvitationTemplateDetailed | null = null;
    const templateId = wedding.invitationTemplateId;
    if (templateId) {
      currentTemplate = await getInvitationTemplateById(templateId);
    }
    if (!currentTemplate) {
      // Fall back to the default template (royal-gold).
      const { getDefaultInvitationTemplate } = await import('@/lib/invitations');
      currentTemplate = await getDefaultInvitationTemplate();
    }

    // Extract media slot declarations from the current template's config.
    let mediaSlotDeclarations: MediaSlot[] = [];
    if (currentTemplate?.config?.mediaSlots) {
      mediaSlotDeclarations = currentTemplate.config.mediaSlots;
    }

    // Parse the current mediaSlotsJson + invitationConfigJson.
    const mediaSlotsJson = safeJsonParse<Record<string, { mediaId?: string; focalPoint?: { x: number; y: number } }>>(
      wedding.mediaSlotsJson,
      {},
    );
    const invitationConfigJson = safeJsonParse<Record<string, unknown>>(
      wedding.invitationConfigJson,
      {},
    );

    return NextResponse.json({
      wedding: {
        id: wedding.id,
        slug: wedding.slug,
        brideName: wedding.brideName,
        groomName: wedding.groomName,
        coupleLabel: wedding.coupleLabel,
        weddingDate: wedding.weddingDate?.toISOString() ?? null,
        venueName: wedding.venueName,
        venueCity: wedding.venueCity,
        status: wedding.status,
        invitationTemplateId: wedding.invitationTemplateId,
        invitationSnapshotId: wedding.invitationSnapshotId,
        mediaSlotsJson,
        invitationConfigJson,
      },
      templates: templateRows.map((t) => {
        const parsedConfig = safeJsonParse<{ sections?: unknown[]; mediaSlots?: MediaSlot[] }>(
          t.configJson,
          { sections: [], mediaSlots: [] },
        );
        return {
          id: t.id,
          slug: t.slug,
          name: t.name,
          description: t.description,
          category: t.category,
          style: t.style,
          layout: t.layout,
          identity: t.identity,
          tier: t.tier,
          status: t.status,
          isPremium: t.isPremium,
          isRecommended: t.isRecommended,
          isDefault: t.isDefault,
          version: t.version,
          thumbnailUrl: t.thumbnailUrl,
          previewUrl: t.previewUrl,
          sectionsCount: Array.isArray(parsedConfig.sections) ? parsedConfig.sections.length : 0,
          mediaSlotsCount: Array.isArray(parsedConfig.mediaSlots) ? parsedConfig.mediaSlots.length : 0,
          mediaSlots: Array.isArray(parsedConfig.mediaSlots) ? parsedConfig.mediaSlots : [],
        };
      }),
      media,
      currentTemplate: currentTemplate
        ? {
            id: currentTemplate.id,
            slug: currentTemplate.slug,
            name: currentTemplate.name,
            category: currentTemplate.category,
            style: currentTemplate.style,
            layout: currentTemplate.layout,
            identity: currentTemplate.identity,
            tier: currentTemplate.tier,
            version: currentTemplate.version,
            config: currentTemplate.config,
          }
        : null,
      mediaSlotDeclarations,
    });
  } catch (error) {
    logger.error('Invitation Studio GET error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

// ─── PUT: save draft (templateId + mediaSlotsJson + invitationConfigJson) ─────
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;
  const user = auth.user!;

  try {
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('Corps de requête invalide');

    const { templateId, mediaSlotsJson, invitationConfigJson } = body as {
      templateId?: string | null;
      mediaSlotsJson?: Record<string, { mediaId?: string; focalPoint?: { x: number; y: number } }>;
      invitationConfigJson?: Record<string, unknown>;
    };

    // Build the update payload — only set fields that are provided.
    const updateData: Record<string, string> = {};
    let changedFields: string[] = [];

    if (templateId !== undefined) {
      // Validate that the template exists and is PUBLISHED.
      if (templateId !== null) {
        const tpl = await getInvitationTemplateById(templateId);
        if (!tpl) {
          return NextResponse.json({ error: 'Template introuvable' }, { status: 404 });
        }
        if (tpl.status !== 'PUBLISHED') {
          return NextResponse.json(
            { error: `Le template "${tpl.slug}" n'est pas publié (statut: ${tpl.status})` },
            { status: 400 },
          );
        }
      }
      updateData.invitationTemplateId = templateId ?? '';
      changedFields.push(`templateId=${templateId ?? 'null'}`);
    }

    if (mediaSlotsJson !== undefined) {
      // Serialize the media slots map. Validate each entry references a real media.
      const slotsObj = mediaSlotsJson ?? {};
      const mediaIds = Object.values(slotsObj)
        .map((v) => v?.mediaId)
        .filter((m): m is string => typeof m === 'string' && m.length > 0);
      if (mediaIds.length > 0) {
        const validMedia = await db.media.findMany({
          where: { id: { in: mediaIds }, weddingId },
          select: { id: true },
        });
        const validIds = new Set(validMedia.map((m) => m.id));
        for (const [slotKey, slotVal] of Object.entries(slotsObj)) {
          if (slotVal?.mediaId && !validIds.has(slotVal.mediaId)) {
            return NextResponse.json(
              { error: `Le média assigné au slot "${slotKey}" n'appartient pas à ce mariage` },
              { status: 400 },
            );
          }
        }
      }
      updateData.mediaSlotsJson = JSON.stringify(slotsObj);
      changedFields.push(`mediaSlots=${Object.keys(slotsObj).length} slots`);
    }

    if (invitationConfigJson !== undefined) {
      updateData.invitationConfigJson = JSON.stringify(invitationConfigJson ?? {});
      changedFields.push(`config=${Object.keys(invitationConfigJson ?? {}).length} keys`);
    }

    if (changedFields.length === 0) {
      return NextResponse.json({ success: true, message: 'Aucune modification', changed: [] });
    }

    // Update the wedding.
    await db.wedding.update({
      where: { id: weddingId },
      data: updateData,
    });

    // Invalidate the wedding cache so the preview (?preview=draft) picks up edits.
    const weddingRow = await db.wedding.findUnique({
      where: { id: weddingId },
      select: { slug: true },
    });
    if (weddingRow?.slug) {
      try {
        await invalidateWeddingCache(weddingRow.slug);
      } catch (cacheErr) {
        logger.warn('Invitation Studio PUT: cache invalidation failed (non-fatal)', {
          weddingId,
          errMessage: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
        });
      }
    }

    await writeAuditLog({
      weddingId,
      userId: user.id,
      action: 'SAVE_INVITATION_STUDIO_DRAFT',
      details: `Invitation Studio draft saved: ${changedFields.join(', ')}`,
      request,
    });

    return NextResponse.json({
      success: true,
      changed: changedFields,
      message: 'Brouillon enregistré (non publié)',
    });
  } catch (error) {
    logger.error('Invitation Studio PUT error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Invalid request', detail: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

// ─── POST: publish (run the deployment pipeline) ─────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: weddingId } = await params;
  const auth = await checkAuth(request, weddingId);
  if ('error' in auth) return auth.error;
  const user = auth.user!;

  try {
    // Run the canonical deployment pipeline — this executes resolveInvitations
    // which composes the InvitationExperienceConfig from the CURRENT wedding
    // fields (templateId + mediaSlotsJson + invitationConfigJson), creates an
    // immutable InvitationTemplateSnapshot, and updates publishedConfigJson.
    const result = await publishWeddingViaPipeline(weddingId, user.id);

    await writeAuditLog({
      weddingId,
      userId: user.id,
      action: 'PUBLISH_INVITATION_STUDIO',
      details: `Invitation Studio published: mode=${result.mode}, deployment=${result.deploymentId ?? 'null'}, version=${result.version ?? 'null'}`,
      request,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: 'Échec de la publication', detail: result.error ?? 'Unknown error' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      mode: result.mode,
      deploymentId: result.deploymentId,
      version: result.version,
      message: 'Invitation publiée — le site public est mis à jour',
    });
  } catch (error) {
    logger.error('Invitation Studio POST error', {
      errMessage: error instanceof Error ? error.message : String(error),
    });
    return internalError();
  }
}

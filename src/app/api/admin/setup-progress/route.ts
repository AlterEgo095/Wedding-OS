// ══════════════════════════════════════════════════════════════════════════════
// /api/admin/setup-progress — P2-UX (Sprint Premium) : parcours de configuration
// ══════════════════════════════════════════════════════════════════════════════
//
// GET → 200 { slug, percent, milestones: [{id, label, done, detail}], nextAction }
//
// Computes the 8 setup milestones of a wedding (profil, invités, histoire,
// chronologie, programme, médias, musique, publication) + a global completion
// percentage + the single "next best action" (first incomplete milestone in
// journey order). Consumed by the premium SetupProgress banner on the admin
// Dashboard (PX-1) and by the /w/[slug]/setup wizard (PX-2).
//
// AUTH: identical gate to /api/admin/dashboard (getAuthUser + CONTROLLER +
// resolveAdminTenant). Every query is explicit weddingId-scoped (same
// defence-in-depth as /api/timeline — the tenantDb TS regression note).
//
// PERF: 7 bounded queries (count-only + 1 findUnique + 1 tiny settings scan)
// — all parallelised in ONE Promise.all, well under 50 ms warm.

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hasPermission } from '@/lib/auth';
import { resolveAdminTenant, runWithTenant } from '@/lib/tenant-context';
import { internalError } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Accès non autorisé' }, { status: 401 });
    if (!hasPermission(user.role, ['CONTROLLER'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { context, error: tenantError } = await resolveAdminTenant(request, user);
    if (tenantError || !context) {
      return NextResponse.json({ error: tenantError?.message }, { status: tenantError?.status ?? 500 });
    }

    return runWithTenant(context, async () => {
      const weddingId = context.weddingId;

      const [wedding, guestCount, storyCount, timelineCount, programCount, mediaCount, settingsRows] =
        await Promise.all([
          db.wedding.findUnique({
            where: { id: weddingId },
            select: {
              slug: true,
              status: true,
              weddingDate: true,
              coupleLabel: true,
              brideName: true,
              groomName: true,
              venueName: true,
              venueCity: true,
            },
          }),
          db.guest.count({ where: { weddingId } }),
          db.coupleStory.count({ where: { weddingId } }),
          db.eventTimeline.count({ where: { weddingId } }),
          db.programItem.count({ where: { weddingId } }),
          db.media.count({ where: { weddingId } }),
          db.settings.findMany({
            where: { weddingId, key: { in: ['music_file', 'music_enabled', 'site_title'] } },
            select: { key: true, value: true },
          }),
        ]);

      if (!wedding) {
        return NextResponse.json({ error: 'Mariage introuvable' }, { status: 404 });
      }

      const settingsMap: Record<string, string> = {};
      for (const row of settingsRows) settingsMap[row.key] = row.value;

      const hasProfile =
        Boolean(wedding.weddingDate) &&
        Boolean(wedding.venueName) &&
        Boolean(wedding.coupleLabel || (wedding.brideName && wedding.groomName));
      const hasMusic =
        Boolean(settingsMap.music_file) || settingsMap.music_enabled === 'true';
      const isPublished = wedding.status === 'PUBLISHED';
      const wasLive = ['UNPUBLISHED', 'COMPLETED'].includes(wedding.status);

      const milestones = [
        {
          id: 'profil',
          label: 'Profil',
          done: hasProfile,
          detail: wedding.weddingDate
            ? new Date(wedding.weddingDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
            : 'Date et lieu manquants',
        },
        {
          id: 'invites',
          label: 'Invités',
          done: guestCount > 0,
          detail: guestCount > 0 ? `${guestCount} invité${guestCount > 1 ? 's' : ''}` : 'Aucun invité',
        },
        {
          id: 'histoire',
          label: 'Histoire',
          done: storyCount > 0,
          detail: storyCount > 0 ? `${storyCount} chapitre${storyCount > 1 ? 's' : ''}` : 'Racontez votre histoire',
        },
        {
          id: 'chronologie',
          label: 'Chronologie',
          done: timelineCount > 0,
          detail: timelineCount > 0 ? `${timelineCount} moment${timelineCount > 1 ? 's' : ''}` : 'Vos moments clés',
        },
        {
          id: 'programme',
          label: 'Programme',
          done: programCount > 0,
          detail: programCount > 0 ? `${programCount} étape${programCount > 1 ? 's' : ''}` : 'Programme du jour',
        },
        {
          id: 'medias',
          label: 'Médias',
          done: mediaCount > 0,
          detail: mediaCount > 0 ? `${mediaCount} fichier${mediaCount > 1 ? 's' : ''}` : 'Photos et vidéos',
        },
        {
          id: 'musique',
          label: 'Musique',
          done: hasMusic,
          detail: hasMusic ? settingsMap.music_file || 'Activée' : 'Ambiance musicale',
        },
        {
          id: 'publication',
          label: 'Publication',
          done: isPublished || wasLive,
          detail: isPublished ? 'Site en ligne' : wasLive ? 'Publié (actuellement hors ligne)' : 'Dernière étape',
        },
      ];

      const doneCount = milestones.filter((m) => m.done).length;
      const percent = Math.round((doneCount / milestones.length) * 100);

      // Next best action — journey order: profil → histoire → chronologie →
      // invités → programme → médias → musique → publication. Wizard-covered
      // milestones deep-link into /setup; the others open the admin.
      const WIZARD_STEP: Record<string, number> = {
        profil: 1,
        histoire: 2,
        chronologie: 3,
        invites: 4,
      };
      const next = milestones.find((m) => !m.done) || null;
      const nextAction = next
        ? {
            label: next.detail,
            href: WIZARD_STEP[next.id]
              ? `/w/${wedding.slug}/setup?step=${WIZARD_STEP[next.id]}`
              : `/w/${wedding.slug}/admin`,
          }
        : null;

      return NextResponse.json({
        slug: wedding.slug,
        status: wedding.status,
        percent,
        milestones,
        nextAction,
      });
    });
  } catch (error) {
    logger.error('Setup progress error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

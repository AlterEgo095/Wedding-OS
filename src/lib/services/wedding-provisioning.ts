// ══════════════════════════════════════════════════════════════════════════════
// Wedding Provisioning Service
// ══════════════════════════════════════════════════════════════════════════════
//
// When a new wedding is created via POST /api/platform/weddings, this service
// automatically provisions the tenant with:
//   1. Default Settings (derived from the wedding's own identity — couple names,
//      date, venue, etc.) so the public page + admin have working config.
//   2. Default Theme (classic-gold template) so the public page renders with
//      the signature Heureux Mariage look.
//   3. Default Couple Story placeholder (so the story section isn't empty).
//
// This makes "CREATE WEDDING → PUBLISH → live public page" work end-to-end
// WITHOUT modifying code or manually configuring each wedding. The wedding is
// immediately functional — the admin can then customize via the Designer tab.
//
// All provisioning is IDEMPOTENT: re-running on an already-provisioned wedding
// is a no-op (upserts on unique keys). This is safe to call from both the
// creation API and a "repair" script.

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeddingIdentity {
  id: string;
  slug: string;
  brideName: string;
  groomName: string;
  coupleLabel: string;
  weddingDate: Date | null;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  venueReference: string | null;
}

interface ProvisioningResult {
  settingsCreated: number;
  themeCreated: boolean;
  coupleStoryCreated: boolean;
  errors: string[];
}

// ─── Default Settings Factory ─────────────────────────────────────────────────
//
// Derives settings from the wedding's OWN identity (not hardcoded couple names).
// This is the key to multi-tenant: each wedding gets settings that reflect ITS
// couple, date, and venue — not Josué & Hornella's data.

function buildDefaultSettings(w: WeddingIdentity): Array<{ key: string; value: string }> {
  const settings: Array<{ key: string; value: string }> = [];

  // Couple identity
  settings.push({ key: 'groom_name', value: w.groomName || '' });
  settings.push({ key: 'bride_name', value: w.brideName || '' });
  settings.push({ key: 'site_title', value: `Mariage ${w.coupleLabel}` });

  // Date + time (if provided)
  if (w.weddingDate) {
    const dateStr = w.weddingDate.toISOString().split('T')[0]; // YYYY-MM-DD
    settings.push({ key: 'wedding_date', value: dateStr });
    const timeStr = w.weddingDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: w.timezone || 'UTC',
    });
    settings.push({ key: 'wedding_time', value: timeStr });
    settings.push({
      key: 'site_subtitle',
      value: w.weddingDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    });
  }

  // Venue
  if (w.venueName) settings.push({ key: 'venue_name', value: w.venueName });
  if (w.venueAddress) settings.push({ key: 'venue_address', value: w.venueAddress });
  if (w.venueCity) settings.push({ key: 'venue_city', value: w.venueCity });
  if (w.venueReference) settings.push({ key: 'venue_reference', value: w.venueReference });
  if (w.venueName) settings.push({ key: 'venue_time', value: 'À confirmer' });
  settings.push({ key: 'venue_parking', value: 'Parking disponible sur place' });

  // Couple-specific messages (templated, use coupleLabel — no hardcoded names)
  settings.push({
    key: 'invitation_message',
    value: `${w.coupleLabel} ont l'honneur de vous inviter à leur célébration de mariage.`,
  });
  settings.push({
    key: 'hashtag',
    value: `#${w.coupleLabel.replace(/[^a-zA-Z]/g, '').replace(/\s+/g, '')}2026`,
  });
  settings.push({
    key: 'welcome_message',
    value: `Bienvenue sur la plateforme du mariage de ${w.coupleLabel}`,
  });
  settings.push({
    key: 'thank_you_message',
    value: "Merci d'être présent pour célébrer notre union",
  });

  // Default theme colors (classic-gold — the signature look)
  settings.push({ key: 'primary_color', value: '#D4A853' });
  settings.push({ key: 'accent_color', value: '#C8785A' });

  return settings;
}

// ─── Main Provisioning Function ───────────────────────────────────────────────

export async function provisionWedding(
  wedding: WeddingIdentity
): Promise<ProvisioningResult> {
  const result: ProvisioningResult = {
    settingsCreated: 0,
    themeCreated: false,
    coupleStoryCreated: false,
    errors: [],
  };

  const weddingId = wedding.id;

  // ─── 1. Default Settings (upsert per-key) ──────────────────────────────
  try {
    const defaultSettings = buildDefaultSettings(wedding);
    for (const setting of defaultSettings) {
      // Composite unique [weddingId, key] — upsert
      await db.settings.upsert({
        where: {
          weddingId_key: { weddingId, key: setting.key },
        },
        update: {}, // no-op on conflict — preserve admin customizations
        create: {
          weddingId,
          key: setting.key,
          value: setting.value,
        },
      });
      result.settingsCreated++;
    }
  } catch (error) {
    const msg = `Settings provisioning failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    result.errors.push(msg);
    logger.error('provisionWedding: settings failed', { weddingId, errMessage: msg });
  }

  // ─── 2. Default Theme (upsert on weddingId unique) ─────────────────────
  try {
    const existingTheme = await db.theme.findUnique({
      where: { weddingId },
      select: { id: true },
    });
    if (!existingTheme) {
      await db.theme.create({
        data: {
          weddingId,
          primaryColor: '#D4A853', // Or Classique — signature gold
          accentColor: '#C8785A',
          fontDisplay: 'Cormorant Garamond',
          fontBody: 'Inter',
          layout: 'classic',
          customizations: null,
        },
      });
      result.themeCreated = true;
    }
  } catch (error) {
    const msg = `Theme provisioning failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    result.errors.push(msg);
    logger.error('provisionWedding: theme failed', { weddingId, errMessage: msg });
  }

  // ─── 3. Default Couple Story placeholder (so story section isn't empty) ─
  try {
    const existingStories = await db.coupleStory.count({
      where: { weddingId },
    });
    if (existingStories === 0) {
      await db.coupleStory.create({
        data: {
          weddingId,
          title: 'Notre Rencontre',
          description: `L'histoire de ${wedding.coupleLabel} commence ici. Personnalisez ce récit depuis l'administration pour raconter votre histoire aux invités.`,
          order: 1,
          // imageUrl left null — no hardcoded photos
        },
      });
      result.coupleStoryCreated = true;
    }
  } catch (error) {
    // Couple story is non-critical — log but don't fail
    logger.error('provisionWedding: couple story failed', {
      weddingId,
      errMessage: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info('provisionWedding: complete', {
    weddingId,
    settingsCreated: result.settingsCreated,
    themeCreated: result.themeCreated,
    coupleStoryCreated: result.coupleStoryCreated,
    errors: result.errors.length,
  });

  return result;
}

// ─── Convenience: provision by weddingId (fetches identity from DB) ───────────

export async function provisionWeddingById(
  weddingId: string
): Promise<ProvisioningResult> {
  const wedding = await db.wedding.findUnique({
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
      venueReference: true,
    },
  });

  if (!wedding) {
    throw new Error(`Wedding not found: ${weddingId}`);
  }

  return provisionWedding(wedding);
}

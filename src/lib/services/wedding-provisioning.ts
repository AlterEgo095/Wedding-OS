// ══════════════════════════════════════════════════════════════════════════════
// Wedding Provisioning Service
// ══════════════════════════════════════════════════════════════════════════════
//
// Two entry points:
//
//   1. `provisionWedding(wedding)` — operates on an ALREADY-EXISTING Wedding row
//      and idempotently provisions Settings + Theme + CoupleStory. Used by the
//      commercial converge flow (`/api/platform/commercial/converge`) and by
//      repair scripts. Safe to re-run.
//
//   2. `provisionWeddingFully(params)` — P5.2-1 (PRE-P5.X-AUDIT-B, HIGH-1).
//      Atomically creates a FULLY-PROVISIONED wedding in a single
//      `$transaction`: Wedding row + Settings + Theme + CoupleStory + (optional)
//      AdminUser. Called by BOTH creation endpoints:
//        - POST /api/platform/weddings         (platform-admin manual creation)
//        - POST /api/onboarding/create-wedding (onboarding wizard)
//      This unifies the two divergent paths so couples get a complete wedding
//      regardless of which entry point they hit. The onboarding wizard still
//      layers Subscription + Invoice + Lead conversion AFTER (commercial
//      concerns, not provisioning concerns) — it can pass its own `tx` to keep
//      everything in one atomic transaction.
//
// Idempotency contract for `provisionWeddingFully`:
//   - Two calls with the same `slug` → second call throws WeddingProvisioningError
//     with code 'SLUG_CONFLICT' (NOT a duplicate row). The route handler
//     translates this to HTTP 409.
//   - Two calls with the same `adminEmail` → second call throws with code
//     'EMAIL_CONFLICT' → HTTP 409.
//   - The function does NOT silently merge — it always creates fresh rows.

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { buildCoupleLabel, type Plan, type WeddingStatus } from '@/lib/types';

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

// ══════════════════════════════════════════════════════════════════════════════
// P5.2-1 — provisionWeddingFully
// ══════════════════════════════════════════════════════════════════════════════
//
// Atomic, fully-provisioned wedding creation. Called by BOTH creation endpoints
// so couples get a complete wedding (Theme + CoupleStory + Settings + optional
// AdminUser) regardless of which path they hit.
//
// Idempotency: slug collision → throws WeddingProvisioningError('SLUG_CONFLICT').
// adminEmail collision → throws WeddingProvisioningError('EMAIL_CONFLICT').
// customDomain collision → throws WeddingProvisioningError('CUSTOM_DOMAIN_CONFLICT').
// The function never silently merges — every successful call produces a fresh
// wedding row.

export type WeddingProvisioningErrorCode =
  | 'SLUG_CONFLICT'
  | 'EMAIL_CONFLICT'
  | 'CUSTOM_DOMAIN_CONFLICT'
  | 'INVALID_INPUT';

export class WeddingProvisioningError extends Error {
  readonly code: WeddingProvisioningErrorCode;
  constructor(code: WeddingProvisioningErrorCode, message: string) {
    super(message);
    this.name = 'WeddingProvisioningError';
    this.code = code;
  }
}

export interface ProvisionWeddingFullyParams {
  // Required identity — slug must already be normalized (lowercase, trimmed,
  // validated via isValidSlug). brideName/groomName must already be cleaned.
  slug: string;
  brideName: string;
  groomName: string;
  // Optional identity
  coupleLabel?: string; // computed by caller via buildCoupleLabel if omitted
  weddingDate?: Date | null;
  timezone?: string; // default 'Africa/Kinshasa'
  venueName?: string | null;
  venueAddress?: string | null;
  venueCity?: string | null;
  venueReference?: string | null;
  // Optional wedding config
  status?: WeddingStatus; // default 'DRAFT'
  plan?: Plan; // default 'TRIAL'
  // P5.2-2 / P5.2-1 — customDomain is settable at creation, but NOT activated
  // (customDomainVerified stays false) until DNS verification passes. The
  // /api/resolve-domain resolver blocks routing for unverified domains.
  customDomain?: string | null;
  organizationId?: string | null;
  // Optional admin (created with role=ORGANIZER, linked to the new wedding).
  // If adminEmail is provided, hashedAdminPassword MUST also be provided.
  adminEmail?: string; // already normalized (lowercase, trimmed)
  adminName?: string; // already cleaned
  hashedAdminPassword?: string; // bcrypt hash pre-computed by caller (CPU-bound,
  // kept OUT of the transaction per P2-SEC-10 / P2-PERF-5)
}

export interface ProvisionWeddingFullyResult {
  wedding: {
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
    status: string;
    plan: string;
    customDomain: string | null;
    customDomainVerified: boolean;
    isDefault: boolean;
    organizationId: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  theme: {
    id: string;
    weddingId: string;
    primaryColor: string;
    accentColor: string;
    fontDisplay: string;
    fontBody: string;
    layout: string;
  };
  coupleStory: {
    id: string;
    weddingId: string;
    title: string;
    description: string;
    order: number;
  };
  settingsCreated: number;
  admin?: {
    id: string;
    email: string;
    name: string;
    role: string;
    weddingId: string | null; // schema-nullable, but always set when created via this function
  };
}

// ─── Unified essential settings factory ──────────────────────────────────────
//
// Unifies the two slightly-divergent essential-settings lists that existed in
// POST /api/platform/weddings (via provisionWedding) and POST /api/onboarding/
// create-wedding (inline). The unified list is a superset of both so existing
// behavior is preserved (additive).

function buildEssentialSettings(params: {
  brideName: string;
  groomName: string;
  coupleLabel: string;
  weddingDate: Date | null;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  venueReference: string | null;
}): Array<{ key: string; value: string }> {
  const {
    brideName,
    groomName,
    coupleLabel,
    weddingDate,
    timezone,
    venueName,
    venueAddress,
    venueCity,
    venueReference,
  } = params;

  const settings: Array<{ key: string; value: string }> = [
    { key: 'bride_name', value: brideName },
    { key: 'groom_name', value: groomName },
    { key: 'site_title', value: `Mariage ${coupleLabel}` },
  ];

  // Date + time
  if (weddingDate) {
    const dateStr = weddingDate.toISOString().split('T')[0]; // YYYY-MM-DD
    settings.push({ key: 'wedding_date', value: dateStr });
    const timeStr = weddingDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone || 'UTC',
    });
    settings.push({ key: 'wedding_time', value: timeStr });
    settings.push({
      key: 'site_subtitle',
      value: weddingDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    });
  } else {
    // Sensible defaults from the onboarding wizard (evening ceremony)
    settings.push({ key: 'wedding_time', value: '21:30' });
    settings.push({ key: 'site_subtitle', value: '' });
  }

  // Venue
  settings.push({ key: 'venue_name', value: venueName ?? '' });
  settings.push({ key: 'venue_address', value: venueAddress ?? '' });
  settings.push({ key: 'venue_city', value: venueCity ?? '' });
  if (venueReference) settings.push({ key: 'venue_reference', value: venueReference });
  settings.push({ key: 'venue_time', value: '21H30' });
  settings.push({ key: 'venue_parking', value: 'Parking disponible sur place' });

  // Couple-specific messages (templated — no hardcoded names)
  const hashtag = `#${brideName.replace(/[^a-zA-Z]/g, '')}Et${groomName.replace(/[^a-zA-Z]/g, '')}${weddingDate ? weddingDate.getFullYear() : ''}`;
  settings.push({ key: 'hashtag', value: hashtag });
  settings.push({
    key: 'welcome_message',
    value: `Bienvenue sur la plateforme du mariage de ${coupleLabel}`,
  });
  settings.push({
    key: 'invitation_message',
    value: `${coupleLabel} ont l'honneur de vous inviter à leur célébration.`,
  });
  settings.push({
    key: 'thank_you_message',
    value: "Merci d'être présent pour célébrer notre union",
  });

  // Default theme colors (classic-gold — the signature look)
  settings.push({ key: 'primary_color', value: '#D4A853' });
  settings.push({ key: 'accent_color', value: '#C8785A' });

  // Music defaults (from onboarding wizard)
  settings.push({ key: 'music_enabled', value: 'false' });
  settings.push({ key: 'music_volume', value: '0.30' });

  return settings;
}

// ─── Inner transactional core ────────────────────────────────────────────────
//
// Runs the actual provisioning logic against either a Prisma TransactionClient
// (when called inside an outer $transaction) or the raw db client. All
// pre-flight uniqueness checks happen INSIDE the tx so concurrent calls cannot
// create duplicates (P2002 is still possible if two requests race past the
// findUnique check — the route handlers also catch Prisma's P2002 and translate
// to 409 as a defense-in-depth).

async function provisionWeddingFullyInTx(
  client: Prisma.TransactionClient,
  params: ProvisionWeddingFullyParams
): Promise<ProvisionWeddingFullyResult> {
  // ─── 0. Normalize + validate inputs ────────────────────────────────────
  const normalizedSlug = params.slug.toLowerCase().trim();
  if (!normalizedSlug) {
    throw new WeddingProvisioningError('INVALID_INPUT', 'slug is required');
  }
  if (params.adminEmail && !params.hashedAdminPassword) {
    throw new WeddingProvisioningError(
      'INVALID_INPUT',
      'hashedAdminPassword is required when adminEmail is provided',
    );
  }

  // ─── 1. Pre-flight uniqueness checks INSIDE the tx ─────────────────────
  const existing = await client.wedding.findUnique({
    where: { slug: normalizedSlug },
    select: { id: true },
  });
  if (existing) {
    throw new WeddingProvisioningError(
      'SLUG_CONFLICT',
      `Wedding with slug "${normalizedSlug}" already exists`,
    );
  }
  if (params.customDomain) {
    const normalizedDomain = params.customDomain.toLowerCase().trim();
    const existingDomain = await client.wedding.findUnique({
      where: { customDomain: normalizedDomain },
      select: { id: true },
    });
    if (existingDomain) {
      throw new WeddingProvisioningError(
        'CUSTOM_DOMAIN_CONFLICT',
        `Wedding with customDomain "${normalizedDomain}" already exists`,
      );
    }
  }
  let adminToCreate: { email: string; name: string; hashedPassword: string } | null = null;
  if (params.adminEmail && params.hashedAdminPassword) {
    const normalizedEmail = params.adminEmail.toLowerCase().trim();
    const existingAdmin = await client.adminUser.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existingAdmin) {
      throw new WeddingProvisioningError(
        'EMAIL_CONFLICT',
        `AdminUser with email "${normalizedEmail}" already exists`,
      );
    }
    adminToCreate = {
      email: normalizedEmail,
      name: (params.adminName ?? '').trim(),
      hashedPassword: params.hashedAdminPassword,
    };
  }

  // ─── 2. Compute derived fields ─────────────────────────────────────────
  const cleanBride = params.brideName.trim();
  const cleanGroom = params.groomName.trim();
  const coupleLabel =
    params.coupleLabel ?? buildCoupleLabel(cleanBride, cleanGroom);
  const finalStatus: WeddingStatus = params.status ?? 'DRAFT';
  const finalPlan: Plan = params.plan ?? 'TRIAL';
  const timezone = params.timezone || 'Africa/Kinshasa';
  const weddingDate = params.weddingDate ?? null;
  const customDomain = params.customDomain
    ? params.customDomain.toLowerCase().trim() || null
    : null;

  // ─── 3. Create the Wedding row ─────────────────────────────────────────
  const wedding = await client.wedding.create({
    data: {
      slug: normalizedSlug,
      brideName: cleanBride,
      groomName: cleanGroom,
      coupleLabel,
      weddingDate,
      timezone,
      venueName: params.venueName ?? null,
      venueAddress: params.venueAddress ?? null,
      venueCity: params.venueCity ?? null,
      venueReference: params.venueReference ?? null,
      status: finalStatus,
      plan: finalPlan,
      customDomain,
      // customDomainVerified defaults to false per schema — never activate
      // a custom domain at creation (P5.2-2 DNS verification gate).
      customDomainVerified: false,
      isDefault: false, // never auto-default — protected by migration script
      organizationId: params.organizationId ?? null,
      publishedAt: finalStatus === 'PUBLISHED' ? new Date() : null,
    },
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
      status: true,
      plan: true,
      customDomain: true,
      customDomainVerified: true,
      isDefault: true,
      organizationId: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // ─── 4. Seed essential Settings (unified list) ─────────────────────────
  const essentialSettings = buildEssentialSettings({
    brideName: cleanBride,
    groomName: cleanGroom,
    coupleLabel,
    weddingDate,
    timezone,
    venueName: wedding.venueName,
    venueAddress: wedding.venueAddress,
    venueCity: wedding.venueCity,
    venueReference: wedding.venueReference,
  });
  await client.settings.createMany({
    data: essentialSettings.map((s) => ({
      weddingId: wedding.id,
      key: s.key,
      value: s.value,
    })),
  });

  // ─── 5. Create default Theme (classic-gold signature look) ─────────────
  const theme = await client.theme.create({
    data: {
      weddingId: wedding.id,
      primaryColor: '#D4A853',
      accentColor: '#C8785A',
      fontDisplay: 'Cormorant Garamond',
      fontBody: 'Inter',
      layout: 'classic',
      customizations: null,
    },
    select: {
      id: true,
      weddingId: true,
      primaryColor: true,
      accentColor: true,
      fontDisplay: true,
      fontBody: true,
      layout: true,
    },
  });

  // ─── 6. Create default CoupleStory placeholder ─────────────────────────
  const coupleStory = await client.coupleStory.create({
    data: {
      weddingId: wedding.id,
      title: 'Notre Rencontre',
      description: `L'histoire de ${coupleLabel} commence ici. Personnalisez ce récit depuis l'administration pour raconter votre histoire aux invités.`,
      order: 1,
    },
    select: {
      id: true,
      weddingId: true,
      title: true,
      description: true,
      order: true,
    },
  });

  // ─── 7. Optionally create the AdminUser (role=ORGANIZER) ───────────────
  let admin: ProvisionWeddingFullyResult['admin'] | undefined;
  if (adminToCreate) {
    admin = await client.adminUser.create({
      data: {
        email: adminToCreate.email,
        password: adminToCreate.hashedPassword,
        name: adminToCreate.name,
        role: 'ORGANIZER',
        weddingId: wedding.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        weddingId: true,
      },
    });
  }

  logger.info('provisionWeddingFully: complete', {
    weddingId: wedding.id,
    slug: wedding.slug,
    settingsCreated: essentialSettings.length,
    themeCreated: true,
    coupleStoryCreated: true,
    adminCreated: !!admin,
  });

  return {
    wedding,
    theme,
    coupleStory,
    settingsCreated: essentialSettings.length,
    admin,
  };
}

// ─── Public entry point ──────────────────────────────────────────────────────
//
// If `options.tx` is provided, the provisioning runs inside the caller's
// $transaction (used by the onboarding wizard so Subscription + Invoice + Lead
// conversion can commit atomically with the wedding + admin). Otherwise, the
// function opens its own $transaction (used by the platform POST endpoint).

export async function provisionWeddingFully(
  params: ProvisionWeddingFullyParams,
  options?: { tx?: Prisma.TransactionClient }
): Promise<ProvisionWeddingFullyResult> {
  if (options?.tx) {
    return provisionWeddingFullyInTx(options.tx, params);
  }
  return db.$transaction((tx) => provisionWeddingFullyInTx(tx, params));
}

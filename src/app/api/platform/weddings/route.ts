export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin, hashPassword } from '@/lib/auth';
import { isValidSlug, buildCoupleLabel, type Plan, type WeddingStatus } from '@/lib/types';
// P2-CQ-1 + P2-SEC-3: shared VALID_PLANS from @lib/constants.
import { VALID_PLANS, EMAIL_REGEX } from '@/lib/constants';
// CONS-2-SECURITY (Fix 5): rate-limit HOF for create endpoints.
import { withRateLimit } from '@/lib/rate-limit';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError , structuredError, validationError } from '@/lib/api-errors';
// P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
// P5.2-1 — unified provisioning: creates Wedding + Settings + Theme + CoupleStory
// + (optional) AdminUser atomically. Replaces the old `provisionWedding` call
// (which only handled Settings/Theme/CoupleStory on an already-created wedding).
import {
  provisionWeddingFully,
  WeddingProvisioningError,
} from '@/lib/services/wedding-provisioning';

/**
 * Platform-level wedding CRUD.
 *
 * GET  /api/platform/weddings?page=1&limit=20&search=&status=&plan=
 *      → { weddings, total, page, limit }  (each wedding includes _count
 *        of guests + admins for at-a-glance capacity usage)
 *
 * POST /api/platform/weddings  { slug, brideName, groomName, ... }
 *      → 201 with the created wedding
 *
 * Platform-admin only — enforced via requirePlatformAdmin(). New weddings
 * always start with `isDefault: false`; only the migration script may
 * mark a wedding as default (the legacy client at "/" depends on it).
 */

// Phase 3 ÉTAPE 6: import canonical VALID_STATUSES from shared module.
// Previously this route had its own 4-value list missing COMPLETED (the 5th
// status introduced in ÉTAPE 5) — that was a latent bug that would have
// blocked programmatic wedding creation with status: 'COMPLETED'.
import { VALID_STATUSES } from '@/lib/wedding-status';
// P2-CQ-1 + P2-SEC-3: VALID_PLANS now imported from @/lib/constants.
// Note: VALID_PLANS is a readonly tuple; .includes(plan as Plan) works
// because the tuple's element type is the union of plan literals.

const WEDDING_LIST_SELECT = {
  id: true,
  slug: true,
  brideName: true,
  groomName: true,
  coupleLabel: true,
  weddingDate: true,
  timezone: true,
  venueName: true,
  venueCity: true,
  status: true,
  plan: true,
  customDomain: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  // Mission 4.8 — portfolio governance fields (needed by Marketing Control Plane UI)
  portfolioVisible: true,
  portfolioType: true,
  portfolioOrder: true,
  caseStudyEnabled: true,
  featured: true,
  collectionId: true,
  _count: {
    select: {
      guests: true,
      admins: true,
    },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim() || '';
    const plan = searchParams.get('plan')?.trim() || '';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (plan) where.plan = plan;
    if (search) {
      where.OR = [
        { slug: { contains: search } },
        { coupleLabel: { contains: search } },
        { brideName: { contains: search } },
        { groomName: { contains: search } },
        { venueName: { contains: search } },
        { venueCity: { contains: search } },
        { customDomain: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;

    const [weddings, total] = await Promise.all([
      db.wedding.findMany({
        where,
        select: WEDDING_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.wedding.count({ where }),
    ]);

    return NextResponse.json({
      weddings,
      total,
      page,
      limit,
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('List platform weddings error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export async function createPlatformWeddingHandler(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => null); // P2-CQ-6
    if (!body) {
      return structuredError(
        'INVALID_BODY',
        'Corps de requête invalide ou mal formé.',
        { status: 400 }
      );
    }
    const {
      slug,
      brideName,
      groomName,
      weddingDate,
      timezone,
      venueName,
      venueAddress,
      venueCity,
      venueReference,
      customDomain,
      organizationId,
      status,
      plan,
      // P5.2-1 — optional admin fields (additive). When provided, an AdminUser
      // (role=ORGANIZER) is created atomically with the wedding. Previously the
      // platform POST endpoint created the wedding WITHOUT any admin, leaving it
      // inaccessible until an admin was manually added — the onboarding wizard
      // had this but the platform endpoint didn't, causing the divergence.
      adminEmail,
      adminName,
      adminPassword,
    } = body;

    // ─── Validation ────────────────────────────────────────────────────────
    if (!slug || typeof slug !== 'string') {
      return validationError('slug', 'Le slug est obligatoire.', 'SLUG_REQUIRED');
    }
    const normalizedSlug = slug.toLowerCase().trim();
    if (!isValidSlug(normalizedSlug)) {
      return validationError(
        'slug',
        'Slug invalide. Utilisez 3 à 32 caractères alphanumériques minuscules ou tirets. Les mots réservés ne sont pas autorisés.',
        'SLUG_INVALID_FORMAT'
      );
    }

    if (brideName === undefined || groomName === undefined) {
      return structuredError(
        'NAMES_REQUIRED',
        'Le nom de la mariée et du marié sont obligatoires.',
        { status: 400, details: [
          { path: 'brideName', message: 'champ obligatoire' },
          { path: 'groomName', message: 'champ obligatoire' },
        ] }
      );
    }
    if (typeof brideName !== 'string' || typeof groomName !== 'string') {
      return structuredError(
        'NAMES_INVALID_TYPE',
        'Le nom de la mariée et du marié doivent être des chaînes de caractères.',
        { status: 400 }
      );
    }

    if (status && !VALID_STATUSES.includes(status as WeddingStatus)) {
      return validationError(
        'status',
        `Statut invalide. Valeurs acceptées: ${VALID_STATUSES.join(', ')}.`,
        'STATUS_INVALID'
      );
    }

    if (plan && !VALID_PLANS.includes(plan as Plan)) {
      return validationError(
        'plan',
        `Plan invalide. Valeurs acceptées: ${VALID_PLANS.join(', ')}.`,
        'PLAN_INVALID'
      );
    }
    // 5.8.18 P2-1 — weddingDate validation (must be a valid date string).
    // Previously an invalid date string was passed to `new Date()` which
    // returns Invalid Date, causing Prisma to throw → 500 internal error.
    if (weddingDate !== undefined && weddingDate !== null) {
      const parsed = new Date(weddingDate as string);
      if (isNaN(parsed.getTime())) {
        return validationError(
          'weddingDate',
          'Date de mariage invalide. Format attendu: AAAA-MM-JJ.',
          'WEDDING_DATE_INVALID'
        );
      }
    }


    // P5.2-1 — optional admin fields validation (only when adminEmail is provided).
    let normalizedAdminEmail: string | undefined;
    let cleanAdminName: string | undefined;
    if (adminEmail !== undefined && adminEmail !== null) {
      if (typeof adminEmail !== 'string' || !EMAIL_REGEX.test(adminEmail.trim())) {
        return NextResponse.json(
          { error: 'adminEmail is invalid' },
          { status: 400 }
        );
      }
      normalizedAdminEmail = adminEmail.trim().toLowerCase();
      if (typeof adminName !== 'string' || adminName.trim().length < 1) {
        return NextResponse.json(
          { error: 'adminName is required when adminEmail is provided' },
          { status: 400 }
        );
      }
      cleanAdminName = adminName.trim();
      if (typeof adminPassword !== 'string' || adminPassword.length < 8) {
        return NextResponse.json(
          { error: 'adminPassword must be at least 8 characters when adminEmail is provided' },
          { status: 400 }
        );
      }
    }

    // P5.2-1 — optional customDomain validation (additive). The domain is
    // stored on the Wedding row but NOT activated — customDomainVerified stays
    // false until the DNS verification flow (P5.2-2) flips it.
    let normalizedCustomDomain: string | null = null;
    if (customDomain !== undefined && customDomain !== null && customDomain !== '') {
      if (typeof customDomain !== 'string') {
        return NextResponse.json(
          { error: 'customDomain must be a string' },
          { status: 400 }
        );
      }
      normalizedCustomDomain = customDomain.toLowerCase().trim();
      if (!normalizedCustomDomain) {
        return NextResponse.json(
          { error: 'customDomain cannot be empty when provided' },
          { status: 400 }
        );
      }
    }

    // ─── Pre-flight uniqueness check (early 409, outside tx) ───────────────
    // The service does this check again inside the tx for race-safety, but
    // we keep the early check for fast-fail (avoid bcrypt if slug collides).
    const existing = await db.wedding.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true },
    });
    if (existing) {
      return structuredError(
        'DUPLICATE_SLUG',
        `Le slug "${normalizedSlug}" existe déjà. Choisissez un autre slug.`,
        { status: 409, field: 'slug' }
      );
    }
    if (normalizedCustomDomain) {
      const existingDomain = await db.wedding.findUnique({
        where: { customDomain: normalizedCustomDomain },
        select: { id: true },
      });
      if (existingDomain) {
        return structuredError(
          'DUPLICATE_CUSTOM_DOMAIN',
          `Le domaine "${normalizedCustomDomain}" est déjà utilisé par un autre mariage.`,
          { status: 409, field: 'customDomain' }
        );
      }
    }
    if (normalizedAdminEmail) {
      const existingAdmin = await db.adminUser.findUnique({
        where: { email: normalizedAdminEmail },
        select: { id: true },
      });
      if (existingAdmin) {
        return structuredError(
          'DUPLICATE_ADMIN_EMAIL',
          `Un administrateur avec l'email "${normalizedAdminEmail}" existe déjà.`,
          { status: 409, field: 'adminEmail' }
        );
      }
    }

    // ─── Hash password BEFORE provisioning (CPU-bound — kept out of tx) ────
    // P2-SEC-10 + P2-PERF-5: bcrypt holds the SQLite single-writer lock for
    // ~250ms at rounds=12. Computing it before opening the tx cuts lock hold
    // time dramatically.
    let hashedAdminPassword: string | undefined;
    if (normalizedAdminEmail && cleanAdminName && adminPassword) {
      hashedAdminPassword = await hashPassword(adminPassword);
    }

    // ─── Couple label + final status/plan ──────────────────────────────────
    const cleanBride = brideName.trim();
    const cleanGroom = groomName.trim();
    const coupleLabel = buildCoupleLabel(cleanBride, cleanGroom);
    const finalStatus = (status as WeddingStatus) || 'DRAFT';
    const finalPlan = (plan as Plan) || 'TRIAL';

    // ─── Atomic fully-provisioned creation ──────────────────────────────────
    // provisionWeddingFully opens its own $transaction and creates:
    //   1. Wedding row (with customDomain set but customDomainVerified=false)
    //   2. Essential Settings (unified list)
    //   3. Default Theme (classic-gold)
    //   4. Default CoupleStory placeholder
    //   5. (Optional) AdminUser with role=ORGANIZER, linked to the new wedding
    // All inside one atomic tx — if any step fails, none of them persist.
    let provisioned: Awaited<ReturnType<typeof provisionWeddingFully>>;
    try {
      provisioned = await provisionWeddingFully({
        slug: normalizedSlug,
        brideName: cleanBride,
        groomName: cleanGroom,
        coupleLabel,
        weddingDate: weddingDate ? new Date(weddingDate) : null,
        timezone: typeof timezone === 'string' ? timezone : 'Africa/Kinshasa',
        venueName: typeof venueName === 'string' ? venueName.trim() || null : null,
        venueAddress: typeof venueAddress === 'string' ? venueAddress.trim() || null : null,
        venueCity: typeof venueCity === 'string' ? venueCity.trim() || null : null,
        venueReference: typeof venueReference === 'string' ? venueReference.trim() || null : null,
        status: finalStatus,
        plan: finalPlan,
        customDomain: normalizedCustomDomain,
        organizationId: typeof organizationId === 'string' ? organizationId : null,
        adminEmail: normalizedAdminEmail,
        adminName: cleanAdminName,
        hashedAdminPassword,
      });
    } catch (provError) {
      // P5.2-1 — translate provisioning errors to HTTP responses.
      if (provError instanceof WeddingProvisioningError) {
        const httpStatus =
          provError.code === 'INVALID_INPUT' ? 400 : 409;
        return NextResponse.json(
          { error: provError.message, code: provError.code },
          { status: httpStatus }
        );
      }
      // P2002 — race condition (two concurrent creates won the pre-flight
      // check then both tried to insert). Translate to 409.
      if (
        typeof provError === 'object' &&
        provError !== null &&
        'code' in provError &&
        (provError as { code: string }).code === 'P2002'
      ) {
        return NextResponse.json(
          { error: 'Slug, customDomain, or email already exists (race condition)' },
          { status: 409 }
        );
      }
      logger.error('Create platform wedding: provisioning failed', {
        slug: normalizedSlug,
        errMessage: provError instanceof Error ? provError.message : String(provError),
      });
      return internalError();
    }

    // ─── Re-fetch with the full WEDDING_LIST_SELECT shape ───────────────────
    // provisionWeddingFully returns a slim wedding object (no _count, no
    // portfolio fields). The platform endpoint's response shape (backward
    // compat) requires WEDDING_LIST_SELECT — re-query to maintain the shape.
    const wedding = await db.wedding.findUnique({
      where: { id: provisioned.wedding.id },
      select: WEDDING_LIST_SELECT,
    });
    if (!wedding) {
      // Should never happen — the wedding was just created in the tx above.
      logger.error('Create platform wedding: post-create re-fetch returned null', {
        weddingId: provisioned.wedding.id,
      });
      return internalError();
    }

    // ─── Backward-compatible provisioning summary ───────────────────────────
    const provisioning = {
      settingsCreated: provisioned.settingsCreated,
      themeCreated: !!provisioned.theme,
      coupleStoryCreated: !!provisioned.coupleStory,
    };

    // ─── Audit log (P2-SEC-14: writeAuditLog populates ipAddress + userAgent) ─
    await writeAuditLog({
      weddingId: null, // platform-level event (action targets a wedding, not in it)
      userId: user!.id,
      action: 'CREATE_WEDDING',
      details:
        `Created wedding ${normalizedSlug}` +
        ` (provisioned: ${provisioning.settingsCreated} settings, theme=${provisioning.themeCreated}, story=${provisioning.coupleStoryCreated})` +
        (provisioned.admin ? `, admin=${provisioned.admin.email}` : ''),
      request,
    });

    // Response is additive vs. the previous shape: { wedding, provisioning, admin? }.
    // `admin` is included only when an AdminUser was created.
    return NextResponse.json(
      { wedding, provisioning, ...(provisioned.admin ? { admin: provisioned.admin } : {}) },
      { status: 201 }
    );
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Create platform wedding error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// CONS-2-SECURITY (Fix 5): wrap the POST handler with rate-limit (30/min/IP).
// Each POST creates a Wedding + AdminUser + Subscription + Invoice + 3 AuditLogs
// inside a $transaction — the rate limit keeps the transaction pool bounded
// and prevents a compromised PLATFORM_ADMIN from flooding the DB.
export const POST = withRateLimit(30, 60_000)(createPlatformWeddingHandler);

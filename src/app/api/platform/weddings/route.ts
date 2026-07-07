export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { isValidSlug, buildCoupleLabel, type Plan, type WeddingStatus } from '@/lib/types';
// P2-CQ-1 + P2-SEC-3: shared VALID_PLANS from @/lib/constants.
import { VALID_PLANS } from '@/lib/constants';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';
// P2-SEC-14: writeAuditLog populates ipAddress + userAgent from request.
import { writeAuditLog } from '@/lib/audit';
// Cascade provisioning — auto-creates theme, settings, couple story for new weddings
import { provisionWedding } from '@/lib/services/wedding-provisioning';

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

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json().catch(() => null); // P2-CQ-6
    if (!body) {
      return NextResponse.json(
        { error: 'Corps de requête invalide' },
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
      venueCity,
      status,
      plan,
    } = body;

    // ─── Validation ────────────────────────────────────────────────────────
    if (!slug || typeof slug !== 'string') {
      return NextResponse.json(
        { error: 'Slug is required' },
        { status: 400 }
      );
    }
    const normalizedSlug = slug.toLowerCase().trim();
    if (!isValidSlug(normalizedSlug)) {
      return NextResponse.json(
        {
          error:
            'Invalid slug. Use 3-32 lowercase alphanumeric characters or hyphens. Reserved words are not allowed.',
        },
        { status: 400 }
      );
    }

    if (brideName === undefined || groomName === undefined) {
      return NextResponse.json(
        { error: 'brideName and groomName are required' },
        { status: 400 }
      );
    }

    if (status && !VALID_STATUSES.includes(status as WeddingStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    if (plan && !VALID_PLANS.includes(plan as Plan)) {
      return NextResponse.json(
        { error: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}` },
        { status: 400 }
      );
    }

    // ─── Uniqueness check (slug + customDomain) ────────────────────────────
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

    // ─── Create wedding ────────────────────────────────────────────────────
    const coupleLabel = buildCoupleLabel(
      typeof brideName === 'string' ? brideName : '',
      typeof groomName === 'string' ? groomName : ''
    );

    const finalStatus = (status as WeddingStatus) || 'DRAFT';
    const finalPlan = (plan as Plan) || 'TRIAL';

    const wedding = await db.wedding.create({
      data: {
        slug: normalizedSlug,
        brideName: typeof brideName === 'string' ? brideName : '',
        groomName: typeof groomName === 'string' ? groomName : '',
        coupleLabel,
        weddingDate: weddingDate ? new Date(weddingDate) : null,
        timezone: timezone || 'Africa/Kinshasa',
        venueName: venueName || null,
        venueCity: venueCity || null,
        status: finalStatus,
        plan: finalPlan,
        isDefault: false, // never auto-default — protected by migration script
        publishedAt: finalStatus === 'PUBLISHED' ? new Date() : null,
      },
      select: WEDDING_LIST_SELECT,
    });

    // ─── Cascade provisioning: auto-create theme, settings, couple story ────
    // This makes the wedding immediately functional — the public page renders
    // with a working theme + the couple's own identity (not hardcoded defaults).
    // Provisioning is idempotent + non-fatal: if it fails, the wedding still
    // exists and the admin can manually configure via the Designer tab.
    let provisioning: { settingsCreated: number; themeCreated: boolean; coupleStoryCreated: boolean } | null = null;
    try {
      provisioning = await provisionWedding({
        id: wedding.id,
        slug: wedding.slug,
        brideName: wedding.brideName,
        groomName: wedding.groomName,
        coupleLabel: wedding.coupleLabel,
        weddingDate: wedding.weddingDate,
        timezone: wedding.timezone,
        venueName: wedding.venueName,
        venueAddress: null,
        venueCity: wedding.venueCity,
        venueReference: null,
      });
    } catch (provError) {
      // Non-fatal: wedding is created, provisioning can be retried via repair script
      logger.error('Wedding provisioning failed (non-fatal)', {
        weddingId: wedding.id,
        errMessage: provError instanceof Error ? provError.message : String(provError),
      });
    }

    // ─── Audit log (P2-SEC-14: writeAuditLog populates ipAddress + userAgent) ─
    await writeAuditLog({
      weddingId: null, // platform-level event (action targets a wedding, not in it)
      userId: user!.id,
      action: 'CREATE_WEDDING',
      details: `Created wedding ${normalizedSlug}` +
        (provisioning
          ? ` (provisioned: ${provisioning.settingsCreated} settings, theme=${provisioning.themeCreated}, story=${provisioning.coupleStoryCreated})`
          : ' (provisioning failed — manual setup required)'),
      request,
    });

    return NextResponse.json({ wedding, provisioning }, { status: 201 });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Create platform wedding error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { isValidSlug, buildCoupleLabel, type Plan, type WeddingStatus } from '@/lib/types';

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

const VALID_STATUSES: WeddingStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'SUSPENDED'];
const VALID_PLANS: Plan[] = ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE'];

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
    console.error('List platform weddings error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const body = await request.json();
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

    // ─── Audit log ─────────────────────────────────────────────────────────
    await db.auditLog.create({
      data: {
        weddingId: null, // platform-level event (action targets a wedding, not in it)
        userId: user!.id,
        action: 'CREATE_WEDDING',
        details: `Created wedding ${normalizedSlug}`,
      },
    });

    return NextResponse.json({ wedding }, { status: 201 });
  } catch (error) {
    console.error('Create platform wedding error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

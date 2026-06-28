export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { buildCoupleLabel, type Plan, type WeddingStatus } from '@/lib/types';
import { invalidateWeddingCache } from '@/lib/tenant-context';

/**
 * Per-wedding operations for the platform admin.
 *
 * GET    /api/platform/weddings/{id}        — fetch single wedding with counts
 * PUT    /api/platform/weddings/{id}        — update wedding fields
 * DELETE /api/platform/weddings/{id}        — delete (blocked if isDefault)
 *
 * Platform-admin only. Uses RAW `db` (not `tenantDb`) because we are
 * operating ON weddings themselves, not on tenant-scoped child rows.
 *
 * Cascade delete: handled by Prisma relations (onDelete: Cascade on
 * Wedding → all tenant-scoped tables). No manual cleanup needed.
 *
 * Cache invalidation: after PUT, invalidateWeddingCache(slug) ensures the
 * next public/admin request re-fetches fresh data from the DB.
 */

const VALID_STATUSES: WeddingStatus[] = ['DRAFT', 'PUBLISHED', 'COMPLETED', 'ARCHIVED', 'SUSPENDED'];
const VALID_PLANS: Plan[] = ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE'];

/**
 * Allowed status transitions (Phase 3 ÉTAPE 5 — commercial lifecycle).
 *
 * Previously, the PUT handler accepted ANY status → ANY status transition
 * (only validated that the new value was in VALID_STATUSES). This matrix
 * enforces the documented lifecycle while remaining a SUPERSET of every
 * transition the previous code allowed (DRAFT → ARCHIVED, PUBLISHED → ARCHIVED,
 * SUSPENDED → PUBLISHED, etc. are all preserved) AND adds the new COMPLETED
 * status transitions.
 *
 * Matrix:
 *   DRAFT      → PUBLISHED, ARCHIVED
 *   PUBLISHED  → COMPLETED, SUSPENDED, ARCHIVED
 *   COMPLETED  → ARCHIVED
 *   SUSPENDED  → PUBLISHED, ARCHIVED
 *   ARCHIVED   → DRAFT, PUBLISHED   (un-archive)
 *
 * Same-status transitions (e.g. PUBLISHED → PUBLISHED) are always allowed —
 * they are idempotent no-ops, not real transitions.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['COMPLETED', 'SUSPENDED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  SUSPENDED: ['PUBLISHED', 'ARCHIVED'],
  ARCHIVED: ['DRAFT', 'PUBLISHED'],
};

function isValidTransition(from: string, to: string): boolean {
  if (from === to) return true; // idempotent
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false; // unknown source state — deny by default
  return allowed.includes(to);
}

const WEDDING_DETAIL_SELECT = {
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
  venueReference: true,
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
      tables: true,
      media: true,
      admins: true,
    },
  },
} as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const wedding = await db.wedding.findUnique({
      where: { id },
      select: WEDDING_DETAIL_SELECT,
    });

    if (!wedding) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ wedding });
  } catch (error) {
    console.error('Get platform wedding error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const existing = await db.wedding.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        brideName: true,
        groomName: true,
        isDefault: true,
        status: true,
        customDomain: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      brideName,
      groomName,
      weddingDate,
      timezone,
      venueName,
      venueAddress,
      venueCity,
      venueLat,
      venueLng,
      venueReference,
      status,
      plan,
      customDomain,
    } = body;

    // ─── Validation ────────────────────────────────────────────────────────
    if (status !== undefined && !VALID_STATUSES.includes(status as WeddingStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    if (plan !== undefined && !VALID_PLANS.includes(plan as Plan)) {
      return NextResponse.json(
        { error: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}` },
        { status: 400 }
      );
    }

    // ─── Status transition validation (Phase 3 ÉTAPE 5) ─────────────────────
    // Enforces the documented lifecycle. Idempotent same-status updates are
    // always allowed; cross-status transitions must be in VALID_TRANSITIONS.
    // This is additive — every previously-allowed transition remains allowed.
    if (status !== undefined && status !== existing.status) {
      if (!isValidTransition(existing.status, status)) {
        return NextResponse.json(
          {
            error: `Transition de statut invalide : ${existing.status} → ${status}. ` +
                   `Transitions autorisées depuis ${existing.status} : ` +
                   `${(VALID_TRANSITIONS[existing.status] || []).join(', ') || 'aucune'}`,
            from: existing.status,
            to: status,
            allowed: VALID_TRANSITIONS[existing.status] || [],
          },
          { status: 400 }
        );
      }
    }

    // customDomain uniqueness check (if changing)
    if (customDomain !== undefined && customDomain !== existing.customDomain) {
      const trimmedDomain = customDomain ? String(customDomain).toLowerCase().trim() : null;
      if (trimmedDomain) {
        const conflict = await db.wedding.findUnique({
          where: { customDomain: trimmedDomain },
          select: { id: true },
        });
        if (conflict && conflict.id !== id) {
          return NextResponse.json(
            { error: `Custom domain "${trimmedDomain}" is already in use` },
            { status: 409 }
          );
        }
      }
    }

    // ─── Build update payload ──────────────────────────────────────────────
    const updateData: Record<string, unknown> = {};

    if (brideName !== undefined) updateData.brideName = String(brideName);
    if (groomName !== undefined) updateData.groomName = String(groomName);

    // Recompute coupleLabel when bride or groom changes
    if (brideName !== undefined || groomName !== undefined) {
      const newBride = brideName !== undefined ? String(brideName) : existing.brideName;
      const newGroom = groomName !== undefined ? String(groomName) : existing.groomName;
      updateData.coupleLabel = buildCoupleLabel(newBride, newGroom);
    }

    if (weddingDate !== undefined) {
      updateData.weddingDate = weddingDate ? new Date(weddingDate) : null;
    }
    if (timezone !== undefined) updateData.timezone = timezone;
    if (venueName !== undefined) updateData.venueName = venueName || null;
    if (venueAddress !== undefined) updateData.venueAddress = venueAddress || null;
    if (venueCity !== undefined) updateData.venueCity = venueCity || null;
    if (venueLat !== undefined) updateData.venueLat = venueLat || null;
    if (venueLng !== undefined) updateData.venueLng = venueLng || null;
    if (venueReference !== undefined) updateData.venueReference = venueReference || null;

    if (status !== undefined) {
      updateData.status = status;
      // Set publishedAt when transitioning to PUBLISHED for the first time
      if (status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
        updateData.publishedAt = new Date();
      }
    }
    if (plan !== undefined) updateData.plan = plan;

    if (customDomain !== undefined) {
      const trimmed = customDomain ? String(customDomain).toLowerCase().trim() : null;
      updateData.customDomain = trimmed;
    }

    // ─── Persist + invalidate cache ────────────────────────────────────────
    const wedding = await db.wedding.update({
      where: { id },
      data: updateData,
      select: WEDDING_DETAIL_SELECT,
    });

    invalidateWeddingCache(existing.slug);

    await db.auditLog.create({
      data: {
        weddingId: null, // platform-level event
        userId: user!.id,
        action: 'UPDATE_WEDDING',
        details: `Updated wedding ${existing.slug} (fields: ${Object.keys(updateData).join(', ')})`,
      },
    });

    return NextResponse.json({ wedding });
  } catch (error) {
    console.error('Update platform wedding error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const existing = await db.wedding.findUnique({
      where: { id },
      select: { id: true, slug: true, isDefault: true, coupleLabel: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Wedding not found' },
        { status: 404 }
      );
    }

    // ─── Protect the default wedding ───────────────────────────────────────
    // The legacy client at "/" depends on the default wedding existing.
    // Deleting it would break the root route + the public marketing page.
    if (existing.isDefault) {
      return NextResponse.json(
        { error: 'Cannot delete the default wedding' },
        { status: 400 }
      );
    }

    // ─── Cascade delete (Prisma handles tenant-scoped rows automatically) ──
    await db.wedding.delete({ where: { id } });

    invalidateWeddingCache(existing.slug);

    await db.auditLog.create({
      data: {
        weddingId: null, // platform-level event
        userId: user!.id,
        action: 'DELETE_WEDDING',
        details: `Deleted wedding ${existing.slug} (${existing.coupleLabel})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete platform wedding error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

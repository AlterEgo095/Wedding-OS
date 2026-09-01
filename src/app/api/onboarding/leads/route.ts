export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';
import { getRateLimitKey, checkRateLimitAsync } from '@/lib/rate-limit';
import { buildCoupleLabel, type Plan } from '@/lib/types';
// P2-CQ-1 + P2-SEC-2: shared EMAIL_REGEX from @/lib/constants.
import { EMAIL_REGEX } from '@/lib/constants';
// P2-SEC-1: structured logger (no stack leak).
import { logger } from '@/lib/logger';
// P2-CQ-5: standardised API errors.
import { internalError } from '@/lib/api-errors';

/**
 * Public lead capture + admin lead list (Phase 7 onboarding).
 *
 * POST /api/onboarding/leads        (PUBLIC — rate-limited per IP)
 *   Submit a new lead from the public /onboarding form.
 *   Returns 201 with the created lead (admin-only fields like `notes` are
 *   never exposed in the public response).
 *
 * GET  /api/onboarding/leads        (PLATFORM_ADMIN)
 *   Paginated lead list with filters (status, search) and a `summary` of
 *   counts by status (ignores filters — for the status tabs UI).
 *
 * Replaces the Phase 7-b in-memory stub with proper Prisma persistence.
 */

// P2-CQ-1 + P2-SEC-2: EMAIL_REGEX now imported from @/lib/constants.
const VALID_LEAD_STATUSES = ['NEW', 'CONTACTED', 'CONVERTED', 'REJECTED'] as const;
const VALID_LEAD_PLANS: Plan[] = ['TRIAL', 'ESSENTIEL', 'PREMIUM', 'ELITE'];

const LEAD_PUBLIC_SELECT = {
  id: true,
  brideName: true,
  groomName: true,
  coupleLabel: true,
  weddingDate: true,
  venueCity: true,
  email: true,
  phone: true,
  plan: true,
  message: true,
  status: true,
  createdAt: true,
} as const;

const LEAD_ADMIN_SELECT = {
  id: true,
  brideName: true,
  groomName: true,
  coupleLabel: true,
  weddingDate: true,
  venueCity: true,
  email: true,
  phone: true,
  plan: true,
  message: true,
  status: true,
  notes: true,
  convertedWeddingId: true,
  convertedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ─── POST — public lead capture ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ─── IP-based rate limit (5 submissions / 15 min) ──────────────────────
    const ipKey = `onboarding-lead-ip:${getRateLimitKey(request)}`;
    if (!(await checkRateLimitAsync(ipKey, 5, 15 * 60 * 1000)).allowed) {
      return NextResponse.json(
        { error: 'Trop de demandes. Réessayez dans quelques minutes.' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Corps de requête invalide.' },
        { status: 400 },
      );
    }

    const {
      brideName,
      groomName,
      weddingDate,
      venueCity,
      email,
      phone,
      plan,
      message,
    } = body as Record<string, unknown>;

    // ─── Validation ────────────────────────────────────────────────────────
    if (
      typeof brideName !== 'string' ||
      brideName.trim().length < 1 ||
      brideName.trim().length > 80
    ) {
      return NextResponse.json(
        { error: 'Le prénom de la mariée est requis (1 à 80 caractères).' },
        { status: 400 },
      );
    }
    if (
      typeof groomName !== 'string' ||
      groomName.trim().length < 1 ||
      groomName.trim().length > 80
    ) {
      return NextResponse.json(
        { error: 'Le prénom du marié est requis (1 à 80 caractères).' },
        { status: 400 },
      );
    }
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json(
        { error: 'Adresse e-mail invalide.' },
        { status: 400 },
      );
    }
    if (phone !== undefined && phone !== null) {
      // Phase 3 ÉTAPE 6: aligned with the wizard's zod schema (max 40 chars).
      // Previously the backend rejected at 30 chars while the form accepted
      // up to 40 — that mismatch silently broke submissions with long
      // formatted phone numbers (e.g. "+243 0970 000 000" with separators).
      if (typeof phone !== 'string' || phone.length > 40) {
        return NextResponse.json(
          { error: 'Numéro de téléphone invalide (max 40 caractères).' },
          { status: 400 },
        );
      }
    }
    if (plan !== undefined && plan !== null) {
      if (typeof plan !== 'string' || !VALID_LEAD_PLANS.includes(plan as Plan)) {
        return NextResponse.json(
          { error: 'Plan invalide (TRIAL, ESSENTIEL, PREMIUM, ELITE).' },
          { status: 400 },
        );
      }
    }
    if (message !== undefined && message !== null) {
      if (typeof message !== 'string' || message.length > 2000) {
        return NextResponse.json(
          { error: 'Message trop long (max 2000 caractères).' },
          { status: 400 },
        );
      }
    }
    if (venueCity !== undefined && venueCity !== null) {
      if (typeof venueCity !== 'string' || venueCity.length > 120) {
        return NextResponse.json(
          { error: 'Ville du lieu trop longue (max 120 caractères).' },
          { status: 400 },
        );
      }
    }
    if (weddingDate !== undefined && weddingDate !== null && weddingDate !== '') {
      const parsed = new Date(String(weddingDate));
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'Date de mariage invalide.' },
          { status: 400 },
        );
      }
    }

    const cleanBride = (brideName as string).trim();
    const cleanGroom = (groomName as string).trim();
    const cleanEmail = (email as string).trim().toLowerCase();
    const coupleLabel = buildCoupleLabel(cleanBride, cleanGroom);

    const lead = await db.lead.create({
      data: {
        brideName: cleanBride,
        groomName: cleanGroom,
        coupleLabel,
        weddingDate:
          weddingDate && weddingDate !== '' ? new Date(String(weddingDate)) : null,
        venueCity:
          venueCity && typeof venueCity === 'string'
            ? (venueCity as string).trim() || null
            : null,
        email: cleanEmail,
        phone:
          phone && typeof phone === 'string'
            ? (phone as string).trim() || null
            : null,
        plan:
          plan && typeof plan === 'string' && VALID_LEAD_PLANS.includes(plan as Plan)
            ? (plan as Plan)
            : 'TRIAL',
        message:
          message && typeof message === 'string'
            ? (message as string).trim() || null
            : null,
        status: 'NEW',
      },
      select: LEAD_PUBLIC_SELECT,
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('Create lead error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

// ─── GET — admin lead list ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const status = searchParams.get('status')?.trim().toUpperCase() || '';

    const where: Record<string, unknown> = {};
    if (status && VALID_LEAD_STATUSES.includes(status as typeof VALID_LEAD_STATUSES[number])) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { brideName: { contains: search } },
        { groomName: { contains: search } },
        { coupleLabel: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const skip = (page - 1) * limit;

    const [leads, total, summary] = await Promise.all([
      db.lead.findMany({
        where,
        select: LEAD_ADMIN_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.lead.count({ where }),
      db.lead.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const summaryMap: Record<string, number> = {
      NEW: 0,
      CONTACTED: 0,
      CONVERTED: 0,
      REJECTED: 0,
    };
    for (const row of summary) {
      summaryMap[row.status] = row._count._all;
    }

    return NextResponse.json({
      leads,
      total,
      page,
      limit,
      summary: summaryMap,
    });
  } catch (error) {
    // P2-SEC-1: never log error.stack.
    logger.error('List leads error', {
      errMessage: error instanceof Error ? error.message : String(error),
      errName: error instanceof Error ? error.name : 'Unknown',
    });
    return internalError();
  }
}

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requirePlatformAdmin } from '@/lib/auth';

/**
 * POST /api/onboarding/leads/{id}/convert    (PLATFORM_ADMIN)
 *
 * Manually mark a lead as converted to an existing wedding.
 * Used when the admin created the wedding through a different flow (e.g.
 * /api/platform/weddings) and wants to link the lead afterwards.
 *
 * The transactional onboarding wizard (/api/onboarding/create-wedding)
 * already auto-converts the lead if `leadId` is provided in its body —
 * this route is the manual fallback for unlinked conversions.
 *
 * Body:
 *   { weddingId: string }
 *
 * Returns:
 *   200 { lead } on success
 *   404 if lead or wedding not found
 *   409 if lead is already converted (strict — non-idempotent)
 */

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

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(request);
    const denied = requirePlatformAdmin(user);
    if (denied) return denied;

    const { id } = await params;

    const lead = await db.lead.findUnique({
      where: { id },
      select: LEAD_ADMIN_SELECT,
    });
    if (!lead) {
      return NextResponse.json(
        { error: 'Lead introuvable.' },
        { status: 404 },
      );
    }

    if (lead.status === 'CONVERTED' || lead.convertedWeddingId) {
      return NextResponse.json(
        { error: 'Ce lead a déjà été converti.' },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Corps de requête invalide.' },
        { status: 400 },
      );
    }
    const { weddingId } = body as Record<string, unknown>;
    if (typeof weddingId !== 'string' || !weddingId.trim()) {
      return NextResponse.json(
        { error: 'weddingId est requis.' },
        { status: 400 },
      );
    }

    const wedding = await db.wedding.findUnique({
      where: { id: weddingId },
      select: { id: true, slug: true, coupleLabel: true },
    });
    if (!wedding) {
      return NextResponse.json(
        { error: 'Mariage introuvable.' },
        { status: 404 },
      );
    }

    const updated = await db.lead.update({
      where: { id },
      data: {
        status: 'CONVERTED',
        convertedWeddingId: wedding.id,
        convertedAt: new Date(),
      },
      select: LEAD_ADMIN_SELECT,
    });

    await db.auditLog.create({
      data: {
        weddingId: null,
        userId: user!.id,
        action: 'LEAD_CONVERTED',
        details: `Lead "${lead.coupleLabel}" (${lead.email}) converted to wedding ${wedding.slug}`,
      },
    });

    return NextResponse.json({ lead: updated });
  } catch (error) {
    console.error('Convert lead error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur.' },
      { status: 500 },
    );
  }
}
